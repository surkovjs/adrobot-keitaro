import copy
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, String, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from app.keitaro import KeitaroError


class FakeBase(DeclarativeBase):
    pass


class FakeEntity(FakeBase):
    __tablename__ = "fake_entities"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)


class FakeTracker:
    """Test-only tracker with isolated database state."""

    def __init__(self, db: Session):
        self.db = db

    async def close(self):
        pass

    def seed(self):
        if self.db.get(FakeEntity, "campaigns/101"):
            return
        entries = {
            "domains/1": {
                "id": 1,
                "name": "demo.example",
                "state": "active",
                "is_ssl": True,
            },
            "groups/1": {"id": 1, "name": "FORTESTS", "type": "campaigns"},
            "traffic_sources/1": {"id": 1, "name": "FORTESTS", "state": "active"},
            "campaigns/101": {
                "id": 101,
                "name": "Romania · Beauty",
                "state": "active",
                "type": "position",
                "domain_id": 1,
                "group_id": 1,
                "traffic_source_id": 1,
                "alias": "demo-ro",
            },
            "streams/201": {
                "id": 201,
                "campaign_id": 101,
                "name": "Geo → Google",
                "position": 1,
                "type": "regular",
                "state": "active",
                "schema": "redirect",
                "action_type": "http",
                "action_payload": "https://google.com",
                "filters": [{"name": "country", "mode": "accept", "payload": ["AU"]}],
                "offers": [],
            },
            "streams/202": {
                "id": 202,
                "campaign_id": 101,
                "name": "Основные офферы",
                "position": 2,
                "type": "default",
                "state": "active",
                "schema": "landings",
                "filters": [],
                "offers": [
                    {"offer_id": 301, "share": 34, "state": "active"},
                    {"offer_id": 302, "share": 33, "state": "active"},
                    {"offer_id": 303, "share": 33, "state": "active"},
                ],
            },
        }
        for i, name in enumerate(
            [
                "Miaflow · Beauty RO · Spin",
                "Miaflow · Beauty RO · Prize",
                "FitoMishki · Weight Loss CO",
                "Oxys · Beauty CL",
                "Alvidex · Joint Care DO",
                "Nutra · Health MX",
            ],
            301,
        ):
            entries[f"offers/{i}"] = {"id": i, "name": name, "state": "active"}
        for key, value in entries.items():
            self.db.add(FakeEntity(key=key, payload=value))
        self.db.commit()

    async def listing(self, path: str):
        self.seed()
        path = path.split("?")[0]
        if path.startswith("campaigns/") and path.endswith("/streams"):
            campaign_id = int(path.split("/")[1])
            return [
                v
                for v in await self.listing("streams")
                if v["campaign_id"] == campaign_id
            ]
        rows = self.db.scalars(
            select(FakeEntity).where(FakeEntity.key.like(path + "/%"))
        ).all()
        return [
            copy.deepcopy(row.payload)
            for row in rows
            if row.payload.get("state") != "deleted"
        ]

    async def request(self, method: str, path: str, payload: dict | None = None) -> Any:
        self.seed()
        path = path.lstrip("/")
        if method == "GET" and ("/" not in path or path.endswith("/streams")):
            return await self.listing(path)
        row = self.db.get(FakeEntity, path)
        if method == "GET":
            if not row:
                raise KeitaroError("Объект не найден", 404)
            return copy.deepcopy(row.payload)
        if method == "POST":
            new_id = int(uuid4().hex[:7], 16)
            result = {**(payload or {}), "id": new_id}
            self.db.add(FakeEntity(key=f"{path}/{new_id}", payload=result))
        elif method == "PUT" and row:
            result = {**row.payload, **(payload or {})}
            row.payload = result
        elif method == "DELETE" and row:
            result = {**row.payload, "state": "deleted"}
            row.payload = result
        else:
            raise KeitaroError("Объект не найден", 404)
        self.db.commit()
        return copy.deepcopy(result)
