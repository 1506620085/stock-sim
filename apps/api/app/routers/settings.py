from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models import FeeTemplate, Instrument, KlineDaily
from app.schemas import DataQualityRead, FeeTemplateCreate, FeeTemplateRead, FeeTemplateUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/fee-templates", response_model=list[FeeTemplateRead])
def list_fee_templates(session: Session = Depends(get_session)) -> list[FeeTemplate]:
    statement = select(FeeTemplate).order_by(
        FeeTemplate.asset_type,
        FeeTemplate.is_default.desc(),
        FeeTemplate.name,
    )
    return list(session.exec(statement).all())


@router.post("/fee-templates", response_model=FeeTemplateRead, status_code=status.HTTP_201_CREATED)
def create_fee_template(payload: FeeTemplateCreate, session: Session = Depends(get_session)) -> FeeTemplate:
    validate_fee_template(payload)
    has_default = session.exec(
        select(FeeTemplate).where(FeeTemplate.asset_type == payload.asset_type, FeeTemplate.is_default == True)  # noqa: E712
    ).first()
    template = FeeTemplate(
        name=payload.name.strip(),
        asset_type=payload.asset_type,
        commission_rate=payload.commission_rate,
        min_commission=payload.min_commission,
        stamp_tax_rate=payload.stamp_tax_rate,
        transfer_rate=payload.transfer_rate,
        config=payload.config,
        is_default=has_default is None,
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


@router.patch("/fee-templates/{template_id}", response_model=FeeTemplateRead)
def update_fee_template(template_id: int, payload: FeeTemplateUpdate, session: Session = Depends(get_session)) -> FeeTemplate:
    template = session.get(FeeTemplate, template_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee template not found")

    values = {key: value for key, value in payload.model_dump(exclude_unset=True).items() if value is not None}
    next_values = {
        "name": values.get("name", template.name),
        "asset_type": values.get("asset_type", template.asset_type),
        "commission_rate": values.get("commission_rate", template.commission_rate),
        "min_commission": values.get("min_commission", template.min_commission),
        "stamp_tax_rate": values.get("stamp_tax_rate", template.stamp_tax_rate),
        "transfer_rate": values.get("transfer_rate", template.transfer_rate),
        "config": values.get("config", template.config),
    }
    validate_fee_template(FeeTemplateCreate(**next_values))

    previous_asset_type = template.asset_type
    was_default = template.is_default

    for key, value in values.items():
        setattr(template, key, value.strip() if key == "name" and isinstance(value, str) else value)

    if was_default and template.asset_type != previous_asset_type:
        template.is_default = False
        ensure_default_for_asset_type(session, previous_asset_type, exclude_id=template.id)

    if not session.exec(
        select(FeeTemplate).where(FeeTemplate.asset_type == template.asset_type, FeeTemplate.is_default == True)  # noqa: E712
    ).first():
        template.is_default = True

    template.updated_at = datetime.now(timezone.utc)
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


@router.post("/fee-templates/{template_id}/set-default", response_model=FeeTemplateRead)
def set_default_fee_template(template_id: int, session: Session = Depends(get_session)) -> FeeTemplate:
    template = session.get(FeeTemplate, template_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee template not found")

    clear_default_for_asset_type(session, template.asset_type, except_id=template.id)
    template.is_default = True
    template.updated_at = datetime.now(timezone.utc)
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


@router.delete("/fee-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fee_template(template_id: int, session: Session = Depends(get_session)) -> None:
    template = session.get(FeeTemplate, template_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fee template not found")
    if template.is_default:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cannot delete default fee template")

    session.delete(template)
    session.commit()


@router.get("/data-quality", response_model=DataQualityRead)
def get_data_quality(
    instrument_id: int = Query(),
    adjust: str = Query(default="qfq", pattern="^(none|qfq|hfq)$"),
    session: Session = Depends(get_session),
) -> DataQualityRead:
    instrument = session.get(Instrument, instrument_id)
    if not instrument:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instrument not found")

    statement = (
        select(KlineDaily)
        .where(KlineDaily.instrument_id == instrument_id)
        .where(KlineDaily.adjust_type == adjust)
        .order_by(KlineDaily.trade_date)
    )
    bars = list(session.exec(statement).all())
    if not bars:
        return DataQualityRead(
            instrument_id=instrument.id or instrument_id,
            symbol=instrument.symbol,
            name=instrument.name,
            adjust_type=adjust,
            source="akshare",
            total_rows=0,
        )

    trade_dates = {bar.trade_date for bar in bars}
    first_date = bars[0].trade_date
    latest_date = bars[-1].trade_date
    missing_weekdays = scan_weekday_gaps(first_date, latest_date, trade_dates)

    last_synced_at = max((bar.source_updated_at for bar in bars if bar.source_updated_at), default=None)

    return DataQualityRead(
        instrument_id=instrument.id or instrument_id,
        symbol=instrument.symbol,
        name=instrument.name,
        adjust_type=adjust,
        source=bars[-1].source,
        total_rows=len(bars),
        first_trade_date=first_date,
        latest_trade_date=latest_date,
        last_synced_at=last_synced_at,
        missing_weekdays=missing_weekdays,
        possible_suspended_dates=missing_weekdays[:30],
    )


def clear_default_for_asset_type(session: Session, asset_type: str, except_id: int | None = None) -> None:
    statement = select(FeeTemplate).where(FeeTemplate.asset_type == asset_type, FeeTemplate.is_default == True)  # noqa: E712
    for item in session.exec(statement).all():
        if except_id is not None and item.id == except_id:
            continue
        item.is_default = False
        item.updated_at = datetime.now(timezone.utc)
        session.add(item)


def ensure_default_for_asset_type(session: Session, asset_type: str, exclude_id: int | None = None) -> None:
    existing_default = session.exec(
        select(FeeTemplate).where(FeeTemplate.asset_type == asset_type, FeeTemplate.is_default == True)  # noqa: E712
    ).first()
    if existing_default:
        return

    statement = select(FeeTemplate).where(FeeTemplate.asset_type == asset_type).order_by(FeeTemplate.updated_at.desc())
    for item in session.exec(statement).all():
        if exclude_id is not None and item.id == exclude_id:
            continue
        item.is_default = True
        item.updated_at = datetime.now(timezone.utc)
        session.add(item)
        return


def validate_fee_template(payload: FeeTemplateCreate) -> None:
    if not payload.name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="template name is required")
    if payload.asset_type not in {"stock", "etf"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="asset_type must be stock or etf")
    for key in ("commission_rate", "min_commission", "stamp_tax_rate", "transfer_rate"):
        value = getattr(payload, key)
        if Decimal(value) < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{key} must not be negative")


def scan_weekday_gaps(start: date, end: date, existing_dates: set[date]) -> list[date]:
    gaps: list[date] = []
    current = start
    while current <= end:
        if current.weekday() < 5 and current not in existing_dates:
            gaps.append(current)
        current += timedelta(days=1)
    return gaps[:120]
