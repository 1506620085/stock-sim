from collections import Counter
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models import JournalEntry, TradingRule
from app.schemas import (
    JournalEntryCreate,
    JournalEntryRead,
    JournalEntryUpdate,
    JournalPeriodSummaryRead,
    TradingRuleCreate,
    TradingRuleRead,
    TradingRuleUpdate,
)

router = APIRouter(prefix="/api/notes", tags=["notes"])

JOURNAL_SIDES = {"buy", "sell", "watch", "other"}
RULE_CATEGORIES = {"position", "buy", "sell", "t_trade", "emotion", "other"}
RULE_STATUSES = {"active", "archived"}


def normalize_tags(tags: list[str] | None) -> list[str]:
    if not tags:
        return []
    cleaned: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        value = tag.strip()
        if not value or value in seen:
            continue
        seen.add(value)
        cleaned.append(value)
    return cleaned


def validate_journal_payload(side: str, reason: str, emotion_score: int | None) -> None:
    if side not in JOURNAL_SIDES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的交易方向")
    if not reason.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写为什么买/卖")
    if emotion_score is not None and (emotion_score < 1 or emotion_score > 5):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="情绪分需在 1–5 之间")


def validate_rule_payload(category: str, status_value: str, title: str, body: str) -> None:
    if category not in RULE_CATEGORIES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的规则分类")
    if status_value not in RULE_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的规则状态")
    if not title.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写规则标题")
    if not body.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写规则正文")


def to_journal_read(entry: JournalEntry) -> JournalEntryRead:
    return JournalEntryRead(
        id=entry.id or 0,
        entry_date=entry.entry_date,
        side=entry.side,
        symbol_code=entry.symbol_code,
        symbol_name=entry.symbol_name,
        price=float(entry.price) if entry.price is not None else None,
        quantity=float(entry.quantity) if entry.quantity is not None else None,
        reason=entry.reason,
        plan_note=entry.plan_note,
        emotion_score=entry.emotion_score,
        emotion_note=entry.emotion_note,
        result_note=entry.result_note,
        tags=entry.tags or [],
        rule_ids=entry.rule_ids or [],
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


@router.get("/journal-entries", response_model=list[JournalEntryRead])
def list_journal_entries(
    side: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    symbol: str | None = Query(default=None),
    emotion_score: int | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[JournalEntryRead]:
    statement = select(JournalEntry).order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
    entries = list(session.exec(statement).all())
    if side:
        entries = [item for item in entries if item.side == side]
    if tag:
        entries = [item for item in entries if tag in (item.tags or [])]
    if emotion_score is not None:
        entries = [item for item in entries if item.emotion_score == emotion_score]
    if symbol:
        keyword = symbol.strip().lower()
        entries = [
            item
            for item in entries
            if (item.symbol_code or "").lower().find(keyword) >= 0 or (item.symbol_name or "").lower().find(keyword) >= 0
        ]
    return [to_journal_read(item) for item in entries]


@router.post("/journal-entries", response_model=JournalEntryRead, status_code=status.HTTP_201_CREATED)
def create_journal_entry(payload: JournalEntryCreate, session: Session = Depends(get_session)) -> JournalEntryRead:
    validate_journal_payload(payload.side, payload.reason, payload.emotion_score)
    entry = JournalEntry(
        entry_date=payload.entry_date,
        side=payload.side,
        symbol_code=(payload.symbol_code or "").strip() or None,
        symbol_name=(payload.symbol_name or "").strip() or None,
        price=payload.price,
        quantity=payload.quantity,
        reason=payload.reason.strip(),
        plan_note=(payload.plan_note or "").strip() or None,
        emotion_score=payload.emotion_score,
        emotion_note=(payload.emotion_note or "").strip() or None,
        result_note=(payload.result_note or "").strip() or None,
        tags=normalize_tags(payload.tags),
        rule_ids=list(dict.fromkeys(payload.rule_ids or [])),
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return to_journal_read(entry)


@router.patch("/journal-entries/{entry_id}", response_model=JournalEntryRead)
def update_journal_entry(
    entry_id: int,
    payload: JournalEntryUpdate,
    session: Session = Depends(get_session),
) -> JournalEntryRead:
    entry = session.get(JournalEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")

    values = payload.model_dump(exclude_unset=True)
    next_side = values.get("side", entry.side)
    next_reason = values.get("reason", entry.reason)
    next_emotion = values.get("emotion_score", entry.emotion_score)
    validate_journal_payload(next_side, next_reason, next_emotion)

    for key, value in values.items():
        if key in {"symbol_code", "symbol_name", "plan_note", "emotion_note", "result_note", "reason"} and isinstance(value, str):
            cleaned = value.strip()
            setattr(entry, key, cleaned if cleaned or key == "reason" else None)
        elif key == "tags":
            entry.tags = normalize_tags(value)
        elif key == "rule_ids":
            entry.rule_ids = list(dict.fromkeys(value or []))
        else:
            setattr(entry, key, value)

    entry.updated_at = datetime.now(timezone.utc)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return to_journal_read(entry)


@router.delete("/journal-entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_journal_entry(entry_id: int, session: Session = Depends(get_session)) -> None:
    entry = session.get(JournalEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
    session.delete(entry)
    session.commit()


@router.get("/trading-rules", response_model=list[TradingRuleRead])
def list_trading_rules(
    status_filter: str | None = Query(default=None, alias="status"),
    category: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[TradingRule]:
    statement = select(TradingRule).order_by(TradingRule.status, TradingRule.updated_at.desc())
    rules = list(session.exec(statement).all())
    if status_filter:
        rules = [item for item in rules if item.status == status_filter]
    if category:
        rules = [item for item in rules if item.category == category]
    return rules


@router.post("/trading-rules", response_model=TradingRuleRead, status_code=status.HTTP_201_CREATED)
def create_trading_rule(payload: TradingRuleCreate, session: Session = Depends(get_session)) -> TradingRule:
    validate_rule_payload(payload.category, payload.status, payload.title, payload.body)
    rule = TradingRule(
        title=payload.title.strip(),
        body=payload.body.strip(),
        category=payload.category,
        status=payload.status,
        tags=normalize_tags(payload.tags),
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return rule


@router.patch("/trading-rules/{rule_id}", response_model=TradingRuleRead)
def update_trading_rule(
    rule_id: int,
    payload: TradingRuleUpdate,
    session: Session = Depends(get_session),
) -> TradingRule:
    rule = session.get(TradingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="规则不存在")

    values = payload.model_dump(exclude_unset=True)
    next_category = values.get("category", rule.category)
    next_status = values.get("status", rule.status)
    next_title = values.get("title", rule.title)
    next_body = values.get("body", rule.body)
    validate_rule_payload(next_category, next_status, next_title, next_body)

    for key, value in values.items():
        if key in {"title", "body"} and isinstance(value, str):
            setattr(rule, key, value.strip())
        elif key == "tags":
            rule.tags = normalize_tags(value)
        else:
            setattr(rule, key, value)

    rule.updated_at = datetime.now(timezone.utc)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return rule


@router.delete("/trading-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trading_rule(rule_id: int, session: Session = Depends(get_session)) -> None:
    rule = session.get(TradingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="规则不存在")
    session.delete(rule)
    session.commit()


@router.get("/journal-period-summary", response_model=JournalPeriodSummaryRead)
def journal_period_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    session: Session = Depends(get_session),
) -> JournalPeriodSummaryRead:
    if end_date < start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="结束日期不能早于开始日期")

    statement = (
        select(JournalEntry)
        .where(JournalEntry.entry_date >= start_date, JournalEntry.entry_date <= end_date)
        .order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
    )
    entries = list(session.exec(statement).all())
    side_counter = Counter(item.side for item in entries)
    tag_counter: Counter[str] = Counter()
    emotion_scores: list[int] = []
    rule_ref_count = 0
    for item in entries:
        tag_counter.update(item.tags or [])
        if item.emotion_score is not None:
            emotion_scores.append(item.emotion_score)
        rule_ref_count += len(item.rule_ids or [])

    return JournalPeriodSummaryRead(
        start_date=start_date,
        end_date=end_date,
        entry_count=len(entries),
        side_stats=[{"side": key, "count": value} for key, value in sorted(side_counter.items())],
        tag_stats=[{"tag": key, "count": value} for key, value in tag_counter.most_common(20)],
        emotion_avg=(sum(emotion_scores) / len(emotion_scores)) if emotion_scores else None,
        emotion_count=len(emotion_scores),
        rule_ref_count=rule_ref_count,
        entries=[to_journal_read(item) for item in entries],
    )
