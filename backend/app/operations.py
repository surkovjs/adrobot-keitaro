"""Operation journal and remote-write semantics shared by both workflows."""

import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from enum import StrEnum

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db import Operation
from app.keitaro import KeitaroError, TrackerClient

logger = logging.getLogger(__name__)
PENDING_TTL = timedelta(minutes=10)


class Status(StrEnum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    UNKNOWN = "unknown"


class Stage(StrEnum):
    VALIDATING = "validating"
    CREATING_CAMPAIGN = "creating_campaign"
    CREATING_STREAMS = "creating_streams"
    VERIFYING = "verifying"
    ACTIVATING = "activating"
    WRITING_STREAM = "writing_stream"
    SAVING_LOCAL = "saving_local"
    ARCHIVING = "archiving"


class WriteOutcome(StrEnum):
    NOT_SENT = "not_sent"
    REJECTED = "rejected"
    UNCERTAIN = "uncertain"
    CONFIRMED = "confirmed"


def fingerprint(value) -> str:
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, ensure_ascii=False, separators=(",", ":")
        ).encode()
    ).hexdigest()


def finish(db: Session, operation: Operation, result: dict, status=Status.COMPLETED):
    operation.status = status
    operation.result = result
    db.commit()


def claim(db: Session, key: str, kind: str, payload: dict) -> tuple[Operation, bool]:
    existing = db.get(Operation, key)
    if existing is None:
        operation = Operation(
            key=key, kind=kind, request_hash=fingerprint(payload), status=Status.PENDING
        )
        try:
            db.add(operation)
            db.commit()
            return operation, False
        except IntegrityError:
            db.rollback()
            existing = db.get(Operation, key)
    if existing.kind != kind or existing.request_hash != fingerprint(payload):
        raise HTTPException(
            409, "Этот ключ запроса уже использован для другого действия"
        )
    if existing.status == Status.COMPLETED:
        return existing, True
    if existing.status == Status.PENDING:
        # A checkpoint refreshes the lease; legacy entries fall back to created_at.
        checkpoint = (existing.result or {}).get("checkpoint_at")
        started = (
            datetime.fromisoformat(checkpoint) if checkpoint else existing.created_at
        )
        if datetime.now(UTC) - started.replace(tzinfo=UTC) > PENDING_TTL:
            finish(
                db,
                existing,
                {
                    **(existing.result or {}),
                    "message": "Запрос прерван или его результат неизвестен. Проверьте состояние в Keitaro перед новым действием.",
                },
                Status.UNKNOWN,
            )
    raise HTTPException(
        409,
        {
            "message": "Предыдущий запрос выполняется или его результат неизвестен. Обновите данные перед повтором.",
            **(existing.result or {}),
            "outcome": Status.FAILED
            if existing.status == Status.FAILED
            else Status.UNKNOWN,
        },
    )


def failure(exc: Exception) -> tuple[int, str]:
    if isinstance(exc, KeitaroError):
        return exc.status, exc.message
    if isinstance(exc, HTTPException):
        return exc.status_code, str(exc.detail)
    logger.exception("Unexpected operation failure")
    return 500, "Внутренняя ошибка. Проверьте состояние операции перед повтором."


class Journal:
    """Short SQL transactions run outside the event loop, never across HTTP awaits."""

    def __init__(self, db: Session, operation: Operation):
        self.db = db
        self.operation = operation
        self.key = operation.key
        self.kind = operation.kind
        self.context = dict(operation.result or {})

    @classmethod
    async def start(cls, db: Session, key: str, kind: str, payload: dict):
        operation, cached = await run_in_threadpool(claim, db, key, kind, payload)
        return cls(db, operation), cached

    async def checkpoint(self, stage: Stage, **context):
        self.context = {
            **self.context,
            **context,
            "stage": stage,
            "checkpoint_at": datetime.now(UTC).isoformat(),
        }
        await run_in_threadpool(
            finish, self.db, self.operation, self.context, Status.PENDING
        )
        logger.info(
            "Operation checkpoint key=%s kind=%s stage=%s",
            self.key,
            self.kind,
            stage,
        )

    async def complete(self, result: dict):
        await run_in_threadpool(finish, self.db, self.operation, result)
        return result

    async def fail(self, exc: Exception, *, unknown: bool, **context):
        await run_in_threadpool(self.db.rollback)
        status, message = failure(exc)
        outcome = Status.UNKNOWN if unknown else Status.FAILED
        reload_hints = ("загрузите поток заново", "загрузите данные заново")
        recovery = context.get("recovery") or ""
        if any(hint in message.casefold() for hint in reload_hints) and any(
            hint in recovery.casefold() for hint in reload_hints
        ):
            context["recovery"] = None
        detail = {**self.context, **context, "message": message, "outcome": outcome}
        await run_in_threadpool(finish, self.db, self.operation, detail, outcome)
        return HTTPException(status, detail)


class RemoteWrite:
    """A refusal proves no write; a lost response requires explicit reconciliation."""

    def __init__(self):
        self.outcome = WriteOutcome.NOT_SENT
        self.recovered_result = None

    @property
    def may_have_applied(self):
        return self.outcome in (WriteOutcome.UNCERTAIN, WriteOutcome.CONFIRMED)

    async def send(
        self,
        client: TrackerClient,
        method: str,
        path: str,
        payload: dict | None = None,
        reconcile: Callable[[], Awaitable[dict]] | None = None,
    ):
        self.outcome = WriteOutcome.UNCERTAIN
        try:
            result = await client.request(method, path, payload)
        except Exception as original:
            if isinstance(original, KeitaroError) and not original.ambiguous:
                self.outcome = WriteOutcome.REJECTED
                raise
            if reconcile is None:
                raise
            logger.warning("Reconciling remote write method=%s path=%s", method, path)
            try:
                result = await reconcile()
                self.recovered_result = result
            except Exception as read_error:
                # Keep the write's cause instead of replacing it with a read failure.
                raise original from read_error
        self.outcome = WriteOutcome.CONFIRMED
        return result
