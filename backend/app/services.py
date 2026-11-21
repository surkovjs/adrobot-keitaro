"""Application workflows. Routing, journal and stream presentation live separately."""

import logging
from enum import StrEnum

from fastapi import HTTPException
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.campaign_routing import (
    build_campaign_payload,
    create_streams,
    validate_references,
    verify_routing,
)
from app.db import StreamMemory
from app.keitaro import KeitaroError, TrackerClient
from app.operations import Journal, RemoteWrite, Stage, WriteOutcome, fingerprint
from app.schemas import CampaignCreate, StreamUpdate
from app.streams import stream_revision, stream_settings, visible_stream

logger = logging.getLogger(__name__)


class CampaignState(StrEnum):
    NOT_CREATED = "not_created"
    CREATING = "creating"
    DISABLED = "disabled"
    ACTIVATING = "activating"
    ACTIVE = "active"
    ARCHIVED = "archived"


class CampaignCreation:
    def __init__(
        self, data: CampaignCreate, key: str, client: TrackerClient, journal: Journal
    ):
        self.data = data
        self.client = client
        self.journal = journal
        self.alias = "adrobot-" + fingerprint(key)[:24]
        self.campaign_id = None
        self.state = CampaignState.NOT_CREATED
        self.creation = RemoteWrite()
        self.activation = RemoteWrite()

    async def find_created(self):
        matches = [
            v
            for v in await self.client.listing("campaigns")
            if v.get("alias") == self.alias
        ]
        if len(matches) != 1 or matches[0].get("state") != "disabled":
            raise KeitaroError(
                "Не удалось подтвердить создание выключенной кампании", ambiguous=True
            )
        return matches[0]

    async def verify_active(self):
        current = await self.client.request("GET", f"campaigns/{self.campaign_id}")
        if current.get("state") != "active":
            raise KeitaroError(
                "Не удалось подтвердить включение кампании", ambiguous=True
            )
        return current

    async def verify_archived(self):
        try:
            current = await self.client.request("GET", f"campaigns/{self.campaign_id}")
        except KeitaroError as exc:
            if exc.status == 404:
                return {"state": "deleted"}
            raise
        if current.get("state") != "deleted":
            raise KeitaroError("Архивирование не подтверждено", ambiguous=True)
        return current

    async def compensate(self):
        if self.creation.outcome == WriteOutcome.REJECTED:
            self.state = CampaignState.NOT_CREATED
        if self.activation.outcome == WriteOutcome.REJECTED:
            self.state = CampaignState.DISABLED
        if self.state in (CampaignState.ACTIVATING, CampaignState.ACTIVE):
            return (
                True,
                "Включение могло выполниться. Кампания не архивирована; проверьте состояние в Keitaro.",
            )
        if self.state == CampaignState.CREATING:
            return True, "Найдите кампанию по alias и проверьте её состояние в Keitaro."
        if self.state != CampaignState.DISABLED:
            return False, None
        try:
            current = await self.client.request("GET", f"campaigns/{self.campaign_id}")
            if current.get("state") == "deleted":
                self.state = CampaignState.ARCHIVED
                return False, "Незавершённая кампания уже находится в архиве Keitaro"
            if current.get("state") != "disabled":
                return (
                    True,
                    "Состояние кампании изменилось. Автоматическое архивирование отменено; проверьте её в Keitaro.",
                )
            # Cleanup must still run when the local DB is unavailable.
            try:
                await self.journal.checkpoint(Stage.ARCHIVING)
            except Exception:
                logger.exception(
                    "Could not journal compensation campaign=%s", self.campaign_id
                )
            await RemoteWrite().send(
                self.client,
                "DELETE",
                f"campaigns/{self.campaign_id}",
                reconcile=self.verify_archived,
            )
            await self.verify_archived()
            self.state = CampaignState.ARCHIVED
            logger.info("Archived incomplete campaign id=%s", self.campaign_id)
            return False, "Незавершённая кампания перенесена в архив Keitaro"
        except Exception:
            logger.exception("Campaign compensation failed id=%s", self.campaign_id)
            return (
                True,
                "Не удалось подтвердить архивирование. Проверьте кампанию в Keitaro.",
            )

    async def run(self):
        await self.journal.checkpoint(Stage.VALIDATING, alias=self.alias)
        source = await validate_references(self.data, self.client)
        await self.journal.checkpoint(Stage.CREATING_CAMPAIGN)
        self.state = CampaignState.CREATING
        campaign = await self.creation.send(
            self.client,
            "POST",
            "campaigns",
            build_campaign_payload(self.data, self.alias, source),
            self.find_created,
        )
        self.campaign_id = int(campaign["id"])
        if campaign.get("state") != "disabled":
            self.state = CampaignState.ACTIVATING
            raise KeitaroError(
                "Keitaro не подтвердил выключенное состояние новой кампании. Проверьте её состояние.",
                ambiguous=True,
            )
        self.state = CampaignState.DISABLED
        await self.journal.checkpoint(
            Stage.CREATING_STREAMS, campaign_id=self.campaign_id
        )
        await create_streams(self.data, self.campaign_id, self.client)
        await self.journal.checkpoint(Stage.VERIFYING)
        await verify_routing(self.data, self.campaign_id, self.client)
        await self.journal.checkpoint(Stage.ACTIVATING)
        self.state = CampaignState.ACTIVATING
        await self.activation.send(
            self.client,
            "PUT",
            f"campaigns/{self.campaign_id}",
            {"state": "active"},
            self.verify_active,
        )
        await self.verify_active()
        self.state = CampaignState.ACTIVE
        await self.journal.checkpoint(Stage.SAVING_LOCAL)
        return await self.journal.complete(
            {
                "id": self.campaign_id,
                "name": self.data.name,
                "message": "Кампания и два потока созданы",
                "alias": campaign.get("alias"),
            }
        )


async def create_campaign(
    data: CampaignCreate, key: str, client: TrackerClient, db: Session
):
    journal, cached = await Journal.start(db, key, "create_campaign", data.model_dump())
    if cached:
        return journal.operation.result
    workflow = CampaignCreation(data, key, client, journal)
    try:
        return await workflow.run()
    except Exception as exc:
        failed_stage = journal.context.get("stage")
        await run_in_threadpool(db.rollback)
        unknown, recovery = await workflow.compensate()
        raise await journal.fail(
            exc,
            unknown=unknown,
            campaign_id=workflow.campaign_id,
            alias=workflow.alias,
            recovery=recovery,
            failed_stage=failed_stage,
        ) from exc


def validate_stream(raw: dict, campaign_id: int, data: StreamUpdate):
    if int(raw["campaign_id"]) != campaign_id:
        raise HTTPException(404, "Поток не принадлежит выбранной кампании")
    if stream_revision(raw) != data.revision:
        raise HTTPException(
            409, "Поток изменился в Keitaro. Обновите данные и повторите изменения."
        )
    if raw.get("schema") != "landings" or raw.get("state") == "deleted":
        raise HTTPException(422, "Этот поток не поддерживает редактирование офферов")


def verify_stream(raw: dict, verified: dict, target: list[dict]):
    if stream_settings(verified) != stream_settings(raw):
        raise KeitaroError(
            "Keitaro изменил дополнительные настройки потока при записи. Проверьте поток в админке и загрузите данные заново."
        )
    actual = {
        int(v["offer_id"]): int(v["share"])
        for v in verified.get("offers", [])
        if v.get("state", "active") == "active" and int(v["share"]) > 0
    }
    if actual != {v["offer_id"]: v["share"] for v in target}:
        raise KeitaroError(
            "Не удалось подтвердить сохранение: доли в Keitaro отличаются от отправленных. Загрузите поток заново."
        )


def remember_stream(
    db: Session, stream_id: int, data: StreamUpdate, verified: dict, catalog: dict
):
    rows = [
        {
            **v.model_dump(),
            "name": catalog.get(v.offer_id, {}).get("name", f"Оффер #{v.offer_id}"),
        }
        for v in data.offers
    ]
    memory = db.get(StreamMemory, stream_id)
    if memory:
        memory.payload = {"offers": rows}
    else:
        db.add(StreamMemory(stream_id=stream_id, payload={"offers": rows}))
    db.flush()
    return visible_stream(verified, db, catalog)


async def update_stream(
    campaign_id: int,
    stream_id: int,
    data: StreamUpdate,
    key: str,
    client: TrackerClient,
    db: Session,
):
    journal, cached = await Journal.start(
        db,
        key,
        f"stream:{stream_id}",
        {"campaign_id": campaign_id, **data.model_dump()},
    )
    if cached:
        return journal.operation.result
    write = RemoteWrite()
    try:
        await journal.checkpoint(
            Stage.VALIDATING, campaign_id=campaign_id, stream_id=stream_id
        )
        raw = await client.request("GET", f"streams/{stream_id}")
        validate_stream(raw, campaign_id, data)
        catalog = {int(v["id"]): v for v in await client.listing("offers")}
        for row in data.offers:
            if not row.removed and (
                row.offer_id not in catalog
                or catalog[row.offer_id].get("state", "active") != "active"
            ):
                raise HTTPException(422, f"Оффер #{row.offer_id} недоступен")
        target = [
            {"offer_id": v.offer_id, "share": v.share, "state": "active"}
            for v in data.offers
            if not v.removed
        ]

        async def reconcile():
            verified = await client.request("GET", f"streams/{stream_id}")
            verify_stream(raw, verified, target)
            return verified

        await journal.checkpoint(Stage.WRITING_STREAM)
        await write.send(
            client, "PUT", f"streams/{stream_id}", {"offers": target}, reconcile
        )
        await journal.checkpoint(Stage.VERIFYING)
        verified = (
            write.recovered_result
            if write.recovered_result is not None
            else await reconcile()
        )
        await journal.checkpoint(Stage.SAVING_LOCAL)
        result = await run_in_threadpool(
            remember_stream, db, stream_id, data, verified, catalog
        )
        return await journal.complete(result)
    except Exception as exc:
        raise await journal.fail(
            exc,
            unknown=write.may_have_applied,
            recovery="Загрузите поток заново перед следующим изменением."
            if write.may_have_applied
            else None,
        ) from exc
