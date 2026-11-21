from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.keitaro import KeitaroClient, TrackerClient

Db = Annotated[Session, Depends(get_db)]


async def get_client(request: Request):
    if request.app.state.tracker is None:
        request.app.state.tracker = KeitaroClient(get_settings())
    yield request.app.state.tracker


Client = Annotated[TrackerClient, Depends(get_client)]


def request_key(idempotency_key: Annotated[str, Header()]) -> str:
    try:
        return str(UUID(idempotency_key))
    except ValueError as exc:
        raise HTTPException(422, "Idempotency-Key должен быть UUID") from exc


Key = Annotated[str, Depends(request_key)]
