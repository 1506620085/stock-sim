from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models import Instrument, WatchlistItem
from app.schemas import WatchlistItemCreate, WatchlistItemRead

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


@router.get("", response_model=list[WatchlistItemRead])
def list_watchlist_items(session: Session = Depends(get_session)) -> list[WatchlistItem]:
    statement = select(WatchlistItem).order_by(WatchlistItem.sort_order, WatchlistItem.id)
    return list(session.exec(statement).all())


@router.post("", response_model=WatchlistItemRead, status_code=status.HTTP_201_CREATED)
def create_watchlist_item(payload: WatchlistItemCreate, session: Session = Depends(get_session)) -> WatchlistItem:
    instrument = session.get(Instrument, payload.instrument_id)
    if not instrument:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instrument not found")

    existing = session.exec(select(WatchlistItem).where(WatchlistItem.instrument_id == payload.instrument_id)).first()
    if existing:
        return existing

    item = WatchlistItem.model_validate(payload)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_watchlist_item(item_id: int, session: Session = Depends(get_session)) -> None:
    item = session.get(WatchlistItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Watchlist item not found")
    session.delete(item)
    session.commit()
