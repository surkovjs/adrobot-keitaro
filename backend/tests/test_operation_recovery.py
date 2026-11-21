from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fake_tracker import FakeEntity, FakeTracker
from test_api import creation, editable, headers, update_payload

from app.db import Operation
from app.keitaro import KeitaroError
from app.main import app, get_client


def install(db, cls):
    async def override():
        yield cls(db)

    app.dependency_overrides[get_client] = override


def test_unexpected_creation_error_archives_and_finishes(client, db):
    class Broken(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "POST" and path == "streams":
                raise KeyError("private internal detail")
            return await super().request(method, path, payload)

    install(db, Broken)
    key = headers()
    result = client.post("/api/campaigns", json=creation(), headers=key)
    assert result.status_code == 500
    assert "private internal detail" not in result.text
    op = db.get(Operation, key["Idempotency-Key"])
    assert op.status == "failed"
    assert (
        db.get(FakeEntity, f"campaigns/{op.result['campaign_id']}").payload["state"]
        == "deleted"
    )
    assert (
        client.post("/api/campaigns", json=creation(), headers=key).status_code == 409
    )


@pytest.mark.parametrize("stage", ["create", "activate"])
def test_lost_success_response_is_reconciled(client, db, stage):
    class LostResponse(FakeTracker):
        async def request(self, method, path, payload=None):
            value = await super().request(method, path, payload)
            if (stage == "create" and method == "POST" and path == "campaigns") or (
                stage == "activate"
                and method == "PUT"
                and path.startswith("campaigns/")
            ):
                raise KeitaroError("Lost response", 504, ambiguous=True)
            return value

    install(db, LostResponse)
    key = headers()
    result = client.post("/api/campaigns", json=creation(), headers=key)
    assert result.status_code == 201, result.text
    assert (
        client.post("/api/campaigns", json=creation(), headers=key).json()
        == result.json()
    )
    assert len(client.get("/api/campaigns").json()) == 2
    assert db.get(Operation, key["Idempotency-Key"]).status == "completed"


def test_unknown_activation_never_archives(client, db):
    class Unavailable(FakeTracker):
        async def request(self, method, path, payload=None):
            if path.startswith("campaigns/") and method in ("PUT", "GET"):
                raise KeitaroError("Unavailable", 504, ambiguous=True)
            return await super().request(method, path, payload)

    install(db, Unavailable)
    key = headers()
    response = client.post("/api/campaigns", json=creation(), headers=key)
    assert response.status_code == 504
    op = db.get(Operation, key["Idempotency-Key"])
    assert op.status == "unknown"
    assert (
        db.get(FakeEntity, f"campaigns/{op.result['campaign_id']}").payload["state"]
        == "disabled"
    )


def test_unexpected_stream_error_finishes_operation(client, db):
    payload = update_payload(editable(client))

    class Broken(FakeTracker):
        async def listing(self, path):
            if path == "offers":
                raise KeyError("broken response")
            return await super().listing(path)

    install(db, Broken)
    key = headers()
    assert (
        client.put(
            "/api/campaigns/101/streams/202", json=payload, headers=key
        ).status_code
        == 500
    )
    assert db.get(Operation, key["Idempotency-Key"]).status == "failed"


def test_stream_write_timeout_preserves_confirmed_pins(client, db):
    payload = update_payload(editable(client))
    payload["offers"] = [{"offer_id": 301, "share": 100, "locked": True}]

    class LostResponse(FakeTracker):
        async def request(self, method, path, payload=None):
            result = await super().request(method, path, payload)
            if method == "PUT":
                raise KeitaroError("Lost response", 504, ambiguous=True)
            return result

    install(db, LostResponse)
    response = client.put(
        "/api/campaigns/101/streams/202", json=payload, headers=headers()
    )
    assert response.status_code == 200, response.text
    assert editable(client)["offers"][0]["locked"] is True


def test_stale_pending_becomes_unknown_without_remote_write(client, db):
    from app.schemas import CampaignCreate
    from app.services import fingerprint

    key = str(uuid4())
    db.add(
        Operation(
            key=key,
            kind="create_campaign",
            request_hash=fingerprint(CampaignCreate(**creation()).model_dump()),
            status="pending",
            created_at=datetime.now(UTC) - timedelta(hours=1),
        )
    )
    db.commit()
    result = client.post(
        "/api/campaigns", json=creation(), headers={"Idempotency-Key": key}
    )
    assert result.status_code == 409
    assert db.get(Operation, key).status == "unknown"
    assert len(client.get("/api/campaigns").json()) == 1


def test_unconfirmed_creation_blocks_duplicate_and_keeps_alias(client, db):
    class MissingResponse(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "POST" and path == "campaigns":
                raise KeitaroError("Unknown result", 504, ambiguous=True)
            return await super().request(method, path, payload)

    install(db, MissingResponse)
    key = headers()
    result = client.post("/api/campaigns", json=creation(), headers=key)
    assert result.status_code == 504
    op = db.get(Operation, key["Idempotency-Key"])
    assert op.status == "unknown"
    assert op.result["alias"].startswith("adrobot-")
    assert (
        client.post("/api/campaigns", json=creation(), headers=key).status_code == 409
    )
    assert len(client.get("/api/campaigns").json()) == 1


def test_changed_timestamp_does_not_cause_false_conflict(client, db):
    payload = update_payload(editable(client))
    entity = db.get(FakeEntity, "streams/202")
    entity.payload = {**entity.payload, "updated_at": "2026-11-21T10:00:00Z"}
    db.commit()
    assert (
        client.put(
            "/api/campaigns/101/streams/202", json=payload, headers=headers()
        ).status_code
        == 200
    )


def test_write_with_different_remote_result_requires_reload(client, db):
    payload = update_payload(editable(client))
    payload["offers"] = [{"offer_id": 301, "share": 100, "locked": True}]

    class IgnoredWrite(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "PUT":
                raise KeitaroError("Write failed", 504, ambiguous=True)
            return await super().request(method, path, payload)

    install(db, IgnoredWrite)
    key = headers()
    response = client.put("/api/campaigns/101/streams/202", json=payload, headers=key)
    assert response.status_code == 504
    assert response.json()["detail"]["message"] == "Write failed"
    assert response.json()["detail"]["outcome"] == "unknown"
    assert db.get(Operation, key["Idempotency-Key"]).status == "unknown"
    assert editable(client)["offers"][0]["locked"] is False


def test_pending_response_always_explains_stage_and_preserves_campaign_id(client, db):
    from app.schemas import CampaignCreate
    from app.services import fingerprint

    key = str(uuid4())
    db.add(
        Operation(
            key=key,
            kind="create_campaign",
            request_hash=fingerprint(CampaignCreate(**creation()).model_dump()),
            status="pending",
            result={"campaign_id": 42, "stage": "creating_streams"},
        )
    )
    db.commit()
    response = client.post(
        "/api/campaigns", json=creation(), headers={"Idempotency-Key": key}
    )
    assert response.status_code == 409
    assert response.json()["detail"]["message"]
    assert response.json()["detail"]["campaign_id"] == 42
    assert response.json()["detail"]["outcome"] == "unknown"


def test_validation_message_has_no_pydantic_prefix(client):
    response = client.post(
        "/api/campaigns", json={**creation(), "geo": "AU,RO"}, headers=headers()
    )
    assert response.status_code == 422
    assert "Value error, " not in response.json()["detail"]["message"]


@pytest.mark.parametrize(
    ("status", "message"),
    [(422, "Оффер не разрешён"), (503, "Не удалось установить соединение")],
)
def test_definite_stream_refusal_preserves_reason_and_allows_new_request(
    client, db, status, message
):
    payload = update_payload(editable(client))
    payload["offers"] = [{"offer_id": 301, "share": 100}]

    class Rejected(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "PUT":
                raise KeitaroError(message, status)
            return await super().request(method, path, payload)

    install(db, Rejected)
    key = headers()
    response = client.put("/api/campaigns/101/streams/202", json=payload, headers=key)
    assert response.status_code == status
    assert response.json()["detail"]["message"] == message
    assert response.json()["detail"]["outcome"] == "failed"
    assert db.get(Operation, key["Idempotency-Key"]).status == "failed"
    install(db, FakeTracker)
    assert (
        client.put(
            "/api/campaigns/101/streams/202", json=payload, headers=headers()
        ).status_code
        == 200
    )


def test_definite_campaign_refusal_does_not_search_alias_or_report_unknown(client, db):
    class Rejected(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "POST" and path == "campaigns":
                raise KeitaroError("Имя не уникально", 422)
            return await super().request(method, path, payload)

        async def listing(self, path):
            assert path != "campaigns", (
                "Definite refusal must not trigger recovery lookup"
            )
            return await super().listing(path)

    install(db, Rejected)
    key = headers()
    response = client.post("/api/campaigns", json=creation(), headers=key)
    assert response.status_code == 422
    assert response.json()["detail"]["message"] == "Имя не уникально"
    assert response.json()["detail"]["outcome"] == "failed"
    assert db.get(Operation, key["Idempotency-Key"]).status == "failed"
    install(db, FakeTracker)
    assert (
        client.post("/api/campaigns", json=creation(), headers=headers()).status_code
        == 201
    )


def test_definite_activation_refusal_archives_disabled_campaign(client, db):
    class Rejected(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "PUT" and path.startswith("campaigns/"):
                raise KeitaroError("Включение запрещено", 422)
            return await super().request(method, path, payload)

    install(db, Rejected)
    response = client.post("/api/campaigns", json=creation(), headers=headers())
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["outcome"] == "failed"
    assert (
        db.get(FakeEntity, f"campaigns/{detail['campaign_id']}").payload["state"]
        == "deleted"
    )


def test_completed_save_key_is_scoped_to_campaign(client):
    payload = update_payload(editable(client))
    key = headers()
    assert (
        client.put(
            "/api/campaigns/101/streams/202", json=payload, headers=key
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/campaigns/999/streams/202", json=payload, headers=key
        ).status_code
        == 409
    )


def test_activation_succeeded_but_local_commit_failed_never_archives(
    client, db, monkeypatch
):
    from app import operations

    original = operations.finish
    failed = False

    def fail_completion(session, operation, result, status=operations.Status.COMPLETED):
        nonlocal failed
        if status == operations.Status.COMPLETED and not failed:
            failed = True
            raise RuntimeError("local DB failed after activation")
        return original(session, operation, result, status)

    monkeypatch.setattr(operations, "finish", fail_completion)
    key = headers()
    response = client.post("/api/campaigns", json=creation(), headers=key)
    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail["outcome"] == "unknown"
    assert detail["failed_stage"] == "saving_local"
    assert (
        db.get(FakeEntity, f"campaigns/{detail['campaign_id']}").payload["state"]
        == "active"
    )
    assert db.get(Operation, key["Idempotency-Key"]).status == "unknown"


def test_failed_cleanup_preserves_original_error_and_recovery_context(client, db):
    class Broken(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "POST" and path == "streams":
                raise KeitaroError("Original stream refusal", 422)
            if method == "DELETE":
                raise KeitaroError("Lost archive response", 504, ambiguous=True)
            return await super().request(method, path, payload)

    install(db, Broken)
    response = client.post("/api/campaigns", json=creation(), headers=headers())
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["message"] == "Original stream refusal"
    assert detail["outcome"] == "unknown"
    assert detail["failed_stage"] == "creating_streams"
    assert detail["campaign_id"]


def test_recent_checkpoint_keeps_long_running_operation_pending(client, db):
    from app.operations import fingerprint
    from app.schemas import CampaignCreate

    key = str(uuid4())
    db.add(
        Operation(
            key=key,
            kind="create_campaign",
            request_hash=fingerprint(CampaignCreate(**creation()).model_dump()),
            status="pending",
            created_at=datetime.now(UTC) - timedelta(hours=1),
            result={
                "stage": "creating_streams",
                "checkpoint_at": datetime.now(UTC).isoformat(),
                "campaign_id": 42,
            },
        )
    )
    db.commit()
    response = client.post(
        "/api/campaigns", json=creation(), headers={"Idempotency-Key": key}
    )
    assert response.status_code == 409
    assert db.get(Operation, key).status == "pending"


@pytest.mark.parametrize("mutation", ["extra_filter", "disabled_offer", "landing"])
def test_routing_verification_rejects_additional_route_changes(client, db, mutation):
    class Altered(FakeTracker):
        async def listing(self, path):
            rows = await super().listing(path)
            if path.startswith("campaigns/") and path.endswith("/streams"):
                for row in rows:
                    if mutation == "extra_filter" and row["type"] == "regular":
                        row["filters"].append(
                            {
                                "name": "device_type",
                                "mode": "accept",
                                "payload": ["mobile"],
                            }
                        )
                    if row["type"] == "default":
                        if mutation == "disabled_offer":
                            row["offers"][0]["state"] = "disabled"
                        if mutation == "landing":
                            row["landings"] = [{"landing_id": 1, "share": 100}]
            return rows

    install(db, Altered)
    response = client.post("/api/campaigns", json=creation(), headers=headers())
    assert response.status_code == 502
    assert response.json()["detail"]["outcome"] == "failed"
    campaign_id = response.json()["detail"]["campaign_id"]
    assert db.get(FakeEntity, f"campaigns/{campaign_id}").payload["state"] == "deleted"


def test_unexpected_active_creation_is_not_archived(client, db):
    class UnexpectedActive(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "POST" and path == "campaigns":
                payload = {**payload, "state": "active"}
            return await super().request(method, path, payload)

    install(db, UnexpectedActive)
    response = client.post("/api/campaigns", json=creation(), headers=headers())
    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["outcome"] == "unknown"
    assert (
        db.get(FakeEntity, f"campaigns/{detail['campaign_id']}").payload["state"]
        == "active"
    )


def test_success_response_without_activation_requires_reconciliation(client, db):
    class IgnoredActivation(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "PUT" and path.startswith("campaigns/"):
                return await super().request("GET", path)
            return await super().request(method, path, payload)

    install(db, IgnoredActivation)
    response = client.post("/api/campaigns", json=creation(), headers=headers())
    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["outcome"] == "unknown"
    assert (
        db.get(FakeEntity, f"campaigns/{detail['campaign_id']}").payload["state"]
        == "disabled"
    )


def test_external_activation_before_compensation_prevents_archiving(client, db):
    class ActivatedExternally(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "POST" and path == "streams":
                await super().request(
                    "PUT", f"campaigns/{payload['campaign_id']}", {"state": "active"}
                )
                raise KeitaroError("Stream creation refused", 422)
            return await super().request(method, path, payload)

    install(db, ActivatedExternally)
    response = client.post("/api/campaigns", json=creation(), headers=headers())
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["outcome"] == "unknown"
    assert (
        db.get(FakeEntity, f"campaigns/{detail['campaign_id']}").payload["state"]
        == "active"
    )


@pytest.mark.parametrize("change", ["settings", "shares"])
def test_reload_hint_is_not_duplicated_after_verification_error(client, db, change):
    payload = update_payload(editable(client))
    payload["offers"] = [{"offer_id": 301, "share": 100}]

    class ChangedSettings(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "PUT" and path == "streams/202":
                if change == "shares":
                    return await super().request("GET", path)
                payload = {**payload, "collect_clicks": False}
            return await super().request(method, path, payload)

    install(db, ChangedSettings)
    key = headers()
    response = client.put("/api/campaigns/101/streams/202", json=payload, headers=key)
    detail = response.json()["detail"]
    assert response.status_code == 502
    assert "загрузите" in detail["message"].casefold()
    assert detail["outcome"] == "unknown"
    assert detail["recovery"] is None
    again = client.put("/api/campaigns/101/streams/202", json=payload, headers=key)
    assert again.status_code == 409
    assert again.json()["detail"]["recovery"] is None


def test_reload_hint_does_not_hide_campaign_compensation(client, db):
    class Rejected(FakeTracker):
        async def request(self, method, path, payload=None):
            if method == "POST" and path == "streams":
                raise KeitaroError("Ошибка. Загрузите поток заново.", 422)
            return await super().request(method, path, payload)

    install(db, Rejected)
    response = client.post("/api/campaigns", json=creation(), headers=headers())
    assert response.status_code == 422
    assert "архив" in response.json()["detail"]["recovery"].casefold()
