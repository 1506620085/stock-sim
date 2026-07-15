from collections import Counter
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, col, select

from app.core.database import get_session
from app.models import JournalEntry, TradingRule
from app.schemas import (
    JournalEntryCreate,
    JournalEntryRead,
    JournalEntryUpdate,
    JournalPeriodSummaryRead,
    TradingRuleCreate,
    TradingRuleRead,
    TradingRuleReorderRequest,
    TradingRuleUpdate,
)

router = APIRouter(prefix="/api/notes", tags=["notes"])

JOURNAL_SIDES = {"buy", "sell", "watch", "other"}
RULE_CATEGORIES = {"position", "buy", "sell", "t_trade", "emotion", "other"}
RULE_STATUSES = {"active", "archived"}
RULE_NODE_TYPES = {"folder", "doc"}
MAX_TREE_DEPTH = 3


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


def validate_journal_payload(side: str, reason: str, emotion_score: int | None, symbol_name: str | None = None) -> None:
    if side not in JOURNAL_SIDES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的交易方向")
    if not (symbol_name or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写标的名称")
    if emotion_score is not None and (emotion_score < 1 or emotion_score > 5):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="情绪分需在 1–5 之间")


def node_depth(session: Session, parent_id: int | None) -> int:
    depth = 1
    current = parent_id
    seen: set[int] = set()
    while current is not None:
        if current in seen:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="目录存在循环引用")
        seen.add(current)
        parent = session.get(TradingRule, current)
        if not parent:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="父目录不存在")
        depth += 1
        if depth > MAX_TREE_DEPTH:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"目录最多支持 {MAX_TREE_DEPTH} 级")
        current = parent.parent_id
    return depth


def validate_rule_payload(
    *,
    category: str,
    status_value: str,
    title: str,
    body: str,
    node_type: str,
    parent_id: int | None,
    session: Session,
    self_id: int | None = None,
) -> None:
    if category not in RULE_CATEGORIES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的规则分类")
    if status_value not in RULE_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的规则状态")
    if node_type not in RULE_NODE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的节点类型")
    if not title.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写标题")
    if parent_id is not None:
        if self_id is not None and parent_id == self_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能将节点移动到自身下")
        parent = session.get(TradingRule, parent_id)
        if not parent:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="父目录不存在")
        if parent.node_type != "folder":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只能移动到目录下")
    node_depth(session, parent_id)


def next_sort_order(session: Session, parent_id: int | None) -> int:
    statement = select(TradingRule).where(TradingRule.parent_id == parent_id)
    siblings = list(session.exec(statement).all())
    if not siblings:
        return 0
    return max(item.sort_order for item in siblings) + 1


def to_rule_read(rule: TradingRule) -> TradingRuleRead:
    return TradingRuleRead(
        id=rule.id or 0,
        title=rule.title,
        body=rule.body,
        category=rule.category,
        status=rule.status,
        tags=rule.tags or [],
        parent_id=rule.parent_id,
        node_type=rule.node_type,
        sort_order=rule.sort_order,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


def collect_descendants(session: Session, root_id: int) -> list[TradingRule]:
    nodes = list(session.exec(select(TradingRule)).all())
    children_map: dict[int | None, list[TradingRule]] = {}
    for node in nodes:
        children_map.setdefault(node.parent_id, []).append(node)
    result: list[TradingRule] = []

    def walk(node_id: int) -> None:
        for child in children_map.get(node_id, []):
            result.append(child)
            if child.id is not None:
                walk(child.id)

    walk(root_id)
    return result


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
    validate_journal_payload(payload.side, payload.reason, payload.emotion_score, payload.symbol_name)
    entry = JournalEntry(
        entry_date=payload.entry_date,
        side=payload.side,
        symbol_code=(payload.symbol_code or "").strip() or None,
        symbol_name=(payload.symbol_name or "").strip(),
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
    next_symbol_name = values.get("symbol_name", entry.symbol_name)
    validate_journal_payload(next_side, next_reason, next_emotion, next_symbol_name)

    for key, value in values.items():
        if key in {"symbol_code", "symbol_name", "plan_note", "emotion_note", "result_note", "reason"} and isinstance(value, str):
            cleaned = value.strip()
            if key == "symbol_name":
                setattr(entry, key, cleaned)
            else:
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
    node_type: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[TradingRuleRead]:
    statement = select(TradingRule).order_by(
        col(TradingRule.parent_id).asc().nullsfirst(),
        TradingRule.sort_order.asc(),
        TradingRule.id.asc(),
    )
    rules = list(session.exec(statement).all())
    if status_filter:
        rules = [item for item in rules if item.status == status_filter]
    if category:
        rules = [item for item in rules if item.category == category]
    if node_type:
        rules = [item for item in rules if item.node_type == node_type]
    return [to_rule_read(item) for item in rules]


@router.post("/trading-rules", response_model=TradingRuleRead, status_code=status.HTTP_201_CREATED)
def create_trading_rule(payload: TradingRuleCreate, session: Session = Depends(get_session)) -> TradingRuleRead:
    validate_rule_payload(
        category=payload.category,
        status_value=payload.status,
        title=payload.title,
        body=payload.body,
        node_type=payload.node_type,
        parent_id=payload.parent_id,
        session=session,
    )
    sort_order = payload.sort_order if payload.sort_order is not None else next_sort_order(session, payload.parent_id)
    rule = TradingRule(
        title=payload.title.strip(),
        body=payload.body if payload.node_type == "doc" else "",
        category=payload.category,
        status=payload.status,
        tags=normalize_tags(payload.tags),
        parent_id=payload.parent_id,
        node_type=payload.node_type,
        sort_order=sort_order,
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return to_rule_read(rule)


@router.post("/trading-rules/reorder", response_model=list[TradingRuleRead])
def reorder_trading_rules(payload: TradingRuleReorderRequest, session: Session = Depends(get_session)) -> list[TradingRuleRead]:
    if not payload.items:
        return []

    updated: list[TradingRule] = []
    for item in payload.items:
        rule = session.get(TradingRule, item.id)
        if not rule:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"节点不存在: {item.id}")
        if item.parent_id is not None:
            parent = session.get(TradingRule, item.parent_id)
            if not parent or parent.node_type != "folder":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只能移动到目录下")
            if item.parent_id == item.id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能将节点移动到自身下")
            descendants = collect_descendants(session, item.id)
            if any(child.id == item.parent_id for child in descendants):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能将节点移动到其子节点下")
            node_depth(session, item.parent_id)
        rule.parent_id = item.parent_id
        rule.sort_order = item.sort_order
        rule.updated_at = datetime.now(timezone.utc)
        session.add(rule)
        updated.append(rule)

    session.commit()
    for rule in updated:
        session.refresh(rule)
    return [to_rule_read(item) for item in updated]


@router.patch("/trading-rules/{rule_id}", response_model=TradingRuleRead)
def update_trading_rule(
    rule_id: int,
    payload: TradingRuleUpdate,
    session: Session = Depends(get_session),
) -> TradingRuleRead:
    rule = session.get(TradingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="规则不存在")

    values = payload.model_dump(exclude_unset=True)
    next_category = values.get("category", rule.category)
    next_status = values.get("status", rule.status)
    next_title = values.get("title", rule.title)
    next_body = values.get("body", rule.body)
    next_node_type = values.get("node_type", rule.node_type)
    next_parent_id = values["parent_id"] if "parent_id" in values else rule.parent_id

    if "parent_id" in values and next_parent_id is not None:
        descendants = collect_descendants(session, rule_id)
        if any(item.id == next_parent_id for item in descendants):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="不能将节点移动到其子节点下")

    validate_rule_payload(
        category=next_category,
        status_value=next_status,
        title=next_title,
        body=next_body or "",
        node_type=next_node_type,
        parent_id=next_parent_id,
        session=session,
        self_id=rule_id,
    )

    for key, value in values.items():
        if key == "title" and isinstance(value, str):
            setattr(rule, key, value.strip())
        elif key == "body" and isinstance(value, str):
            setattr(rule, key, value)
        elif key == "tags":
            rule.tags = normalize_tags(value)
        else:
            setattr(rule, key, value)

    rule.updated_at = datetime.now(timezone.utc)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return to_rule_read(rule)


@router.delete("/trading-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trading_rule(rule_id: int, session: Session = Depends(get_session)) -> None:
    rule = session.get(TradingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="规则不存在")
    for child in reversed(collect_descendants(session, rule_id)):
        session.delete(child)
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
