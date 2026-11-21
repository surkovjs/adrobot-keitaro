import copy
from uuid import uuid4

import httpx
import pytest
from fake_tracker import FakeEntity, FakeTracker
from sqlalchemy import select

from app.config import Settings
from app.db import Operation
from app.keitaro import KeitaroClient, KeitaroError
from app.main import app, get_client


def headers():
    return {"Idempotency-Key": str(uuid4())}


def creation():
    return {
        "name": "Test Campaign",
        "geo": "au",
        "domain_id": 1,
        "group_id": 1,
        "traffic_source_id": 1,
        "offer_id": 301,
    }


def editable(client):
    return client.get("/api/campaigns/101").json()["streams"][1]


def update_payload(stream):
    return {
        "revision": stream["revision"],
        "offers": [
            {key: row[key] for key in ["offer_id", "share", "removed", "locked"]}
            for row in stream["offers"]
        ],
    }


def test_catalog_and_search(client):
    assert client.get("/api/catalog").json()["groups"] == [
        {"id": 1, "name": "FORTESTS"}
    ]
    assert len(client.get("/api/offers?q=301").json()) == 1
    assert len(client.get("/api/offers?q=missing").json()) == 0
    assert client.get("/api/campaigns?q=101").json()[0]["id"] == 101


def test_create_routes_and_idempotency(client, db):
    key = headers()
    first = client.post("/api/campaigns", json=creation(), headers=key)
    assert first.status_code == 201, first.text
    again = client.post("/api/campaigns", json=creation(), headers=key)
    assert again.json() == first.json()
    detail = client.get(f"/api/campaigns/{first.json()['id']}").json()
    assert detail["state"] == "active"
    geo, offer = detail["streams"]
    assert geo["filters"][0]["payload"] == ["AU"]
    assert geo["action_payload"] == "https://google.com"
    assert offer["type"] == "default"
    assert offer["offers"][0]["share"] == 100
    assert len(client.get("/api/campaigns").json()) == 2
    assert len(db.scalars(select(Operation)).all()) == 1
    changed = client.post(
        "/api/campaigns", json={**creation(), "name": "Different"}, headers=key
    )
    assert changed.status_code == 409


@pytest.mark.parametrize(
    "changes",
    [
        {"geo": "XX"},
        {"geo": "AU,RO"},
        {"name": "   "},
        {"offer_id": -1},
        {"offer_id": True},
        {"offer_id": "301"},
        {"unexpected": 1},
    ],
)
def test_create_validation(client, changes):
    response = client.post(
        "/api/campaigns", json={**creation(), **changes}, headers=headers()
    )
    assert response.status_code == 422


def test_invalid_reference_has_no_remote_write(client):
    response = client.post(
        "/api/campaigns", json={**creation(), "offer_id": 999}, headers=headers()
    )
    assert response.status_code == 404
    assert len(client.get("/api/campaigns").json()) == 1


def test_save_removal_pins_and_restore_after_reload(client, db):
    stream = editable(client)
    payload = update_payload(stream)
    payload["offers"] = [
        {"offer_id": 301, "share": 25, "locked": True},
        {"offer_id": 302, "share": 75},
        {"offer_id": 303, "share": 0, "removed": True},
    ]
    before = copy.deepcopy(db.get(FakeEntity, "streams/201").payload)
    key = headers()
    saved = client.put("/api/campaigns/101/streams/202", json=payload, headers=key)
    assert saved.status_code == 200, saved.text
    assert (
        client.put("/api/campaigns/101/streams/202", json=payload, headers=key).json()
        == saved.json()
    )
    reloaded = editable(client)
    assert [(v["share"], v["removed"], v["locked"]) for v in reloaded["offers"]] == [
        (25, False, True),
        (75, False, False),
        (0, True, False),
    ]
    assert db.get(FakeEntity, "streams/201").payload == before
    payload = update_payload(reloaded)
    payload["offers"] = [
        {"offer_id": 301, "share": 25, "locked": True},
        {"offer_id": 302, "share": 38},
        {"offer_id": 303, "share": 37},
    ]
    restored = client.put(
        "/api/campaigns/101/streams/202", json=payload, headers=headers()
    )
    assert restored.status_code == 200
    assert [v["share"] for v in editable(client)["offers"]] == [25, 38, 37]


def test_conflict_does_not_overwrite_remote_changes(client, db):
    payload = update_payload(editable(client))
    row = db.get(FakeEntity, "streams/202")
    row.payload = {**row.payload, "name": "Changed by another user"}
    db.commit()
    response = client.put(
        "/api/campaigns/101/streams/202", json=payload, headers=headers()
    )
    assert response.status_code == 409
    assert (
        db.get(FakeEntity, "streams/202").payload["name"] == "Changed by another user"
    )


@pytest.mark.parametrize(
    "rows",
    [
        [],
        [{"offer_id": 301, "share": 99}],
        [
            {"offer_id": 301, "share": 100},
            {"offer_id": 301, "share": 0, "removed": True},
        ],
        [
            {"offer_id": 301, "share": 100},
            {"offer_id": 302, "share": 1, "removed": True},
        ],
        [{"offer_id": 301, "share": 100}, {"offer_id": 302, "share": 0}],
        [{"offer_id": 301, "share": 100.5}],
        [{"offer_id": 301, "share": True}],
        [
            {"offer_id": 301, "share": 100},
            {"offer_id": 302, "share": 0, "removed": True, "locked": True},
        ],
    ],
)
def test_server_rejects_invalid_distributions(client, rows):
    payload = {"revision": editable(client)["revision"], "offers": rows}
    assert (
        client.put(
            "/api/campaigns/101/streams/202", json=payload, headers=headers()
        ).status_code
        == 422
    )


def test_cannot_edit_another_campaign_or_geo_stream(client):
    payload = update_payload(editable(client))
    assert (
        client.put(
            "/api/campaigns/999/streams/202", json=payload, headers=headers()
        ).status_code
        == 404
    )
    geo = client.get("/api/campaigns/101").json()["streams"][0]
    payload["revision"] = geo["revision"]
    assert (
        client.put(
            "/api/campaigns/101/streams/201", json=payload, headers=headers()
        ).status_code
        == 422
    )


def test_partial_creation_is_archived(client, db):
    class FailingClient(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "POST" and path == "streams" and payload["type"] == "default":
                raise KeitaroError("Test stream failure")
            return await super().request(method, path, payload)

    async def failing():
        yield FailingClient(db)

    app.dependency_overrides[get_client] = failing
    response = client.post("/api/campaigns", json=creation(), headers=headers())
    assert response.status_code == 502
    campaign_id = response.json()["detail"]["campaign_id"]
    assert db.get(FakeEntity, f"campaigns/{campaign_id}").payload["state"] == "deleted"


def test_cross_origin_writes_are_blocked(client):
    assert (
        client.post(
            "/api/campaigns",
            json=creation(),
            headers={**headers(), "Origin": "https://other.example"},
        ).status_code
        == 403
    )


def test_update_preserves_existing_filters_landings_and_triggers(client, db):
    editable(client)
    entity = db.get(FakeEntity, "streams/202")
    settings = {
        "filters": [{"name": "country", "mode": "reject", "payload": ["RO"]}],
        "landings": [{"landing_id": 17, "share": 100, "state": "active"}],
        "triggers": [{"id": 4, "action": "disable"}],
        "comments": "Do not change",
        "weight": 42,
    }
    entity.payload = {**entity.payload, **settings}
    db.commit()
    payload = update_payload(editable(client))
    payload["offers"] = [{"offer_id": 301, "share": 100}]
    response = client.put(
        "/api/campaigns/101/streams/202", json=payload, headers=headers()
    )
    assert response.status_code == 200, response.text
    after = db.get(FakeEntity, "streams/202").payload
    assert {key: after[key] for key in settings} == settings


def test_disabled_stream_can_be_edited_without_enabling_it(client, db):
    editable(client)
    entity = db.get(FakeEntity, "streams/202")
    entity.payload = {**entity.payload, "state": "disabled"}
    db.commit()
    stream = editable(client)
    assert stream["editable"] is True
    payload = update_payload(stream)
    payload["offers"] = [{"offer_id": 301, "share": 100}]
    response = client.put(
        "/api/campaigns/101/streams/202", json=payload, headers=headers()
    )
    assert response.status_code == 200
    assert db.get(FakeEntity, "streams/202").payload["state"] == "disabled"


def test_detects_unexpected_remote_side_effect(client, db):
    payload = update_payload(editable(client))

    class MisbehavingClient(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "PUT" and path == "streams/202":
                payload = {**payload, "collect_clicks": False}
            return await super().request(method, path, payload)

    async def bad():
        yield MisbehavingClient(db)

    app.dependency_overrides[get_client] = bad
    response = client.put(
        "/api/campaigns/101/streams/202", json=payload, headers=headers()
    )
    assert response.status_code == 502
    assert "дополнительные настройки" in response.json()["detail"]["message"]


@pytest.mark.asyncio
async def test_live_adapter_uses_header_and_preserves_partial_updates():
    requests = []

    def handler(request):
        requests.append(request)
        assert request.headers["Api-Key"] == "test-key"
        return httpx.Response(200, json={"id": 20})

    adapter = KeitaroClient(
        Settings(
            _env_file=None,
            keitaro_url="https://tracker.example",
            keitaro_api_key="test-key",
        )
    )
    await adapter.client.aclose()
    adapter.client = httpx.AsyncClient(
        base_url="https://tracker.example/admin_api/v1/",
        headers={"Api-Key": "test-key"},
        transport=httpx.MockTransport(handler),
    )
    await adapter.request(
        "PUT", "streams/20", {"offers": [{"offer_id": 1, "share": 100}]}
    )
    assert requests[0].url.path == "/admin_api/v1/streams/20"
    assert b'"filters"' not in requests[0].content
    await adapter.close()


def test_campaign_stream_details_are_loaded_concurrently(client, db):
    import asyncio

    class ParallelClient(FakeTracker):
        def __init__(self, session):
            super().__init__(session)
            self.started = set()
            self.ready = None

        async def request(self, method, path, payload=None):
            if method == "GET" and path in {"streams/201", "streams/202"}:
                if self.ready is None:
                    self.ready = asyncio.Event()
                self.started.add(path)
                if len(self.started) == 2:
                    self.ready.set()
                await asyncio.wait_for(self.ready.wait(), timeout=1)
            return await super().request(method, path, payload)

    async def override():
        yield ParallelClient(db)

    app.dependency_overrides[get_client] = override
    response = client.get("/api/campaigns/101")
    assert response.status_code == 200
    assert [stream["id"] for stream in response.json()["streams"]] == [201, 202]
