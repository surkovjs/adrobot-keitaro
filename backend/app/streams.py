from sqlalchemy.orm import Session

from app.db import StreamMemory
from app.operations import fingerprint


def stream_settings(raw: dict) -> dict:
    """Ignore server timestamps and equivalent normalization of empty text fields."""
    settings = {
        key: value for key, value in raw.items() if key not in ("offers", "updated_at")
    }
    for key in ("comments", "action_payload"):
        settings[key] = settings.get(key) or ""
    return settings


def stream_revision(raw: dict) -> str:
    return fingerprint({**stream_settings(raw), "offers": raw.get("offers", [])})


def visible_stream(raw: dict, db: Session, offers_by_id: dict) -> dict:
    memory = db.get(StreamMemory, raw["id"])
    previous = memory.payload.get("offers", []) if memory else []
    saved = {v["offer_id"]: v for v in previous}
    rows = []
    for v in raw.get("offers", []):
        oid = int(v["offer_id"])
        removed = v.get("state", "active") != "active" or int(v.get("share", 0)) == 0
        rows.append(
            {
                "offer_id": oid,
                "name": offers_by_id.get(oid, {}).get("name", f"Оффер #{oid}"),
                "share": 0 if removed else int(v["share"]),
                "removed": removed,
                "locked": False if removed else saved.get(oid, {}).get("locked", False),
            }
        )
    present = {v["offer_id"] for v in rows}
    for v in previous:
        if v["offer_id"] not in present:
            rows.append({**v, "share": 0, "removed": True, "locked": False})
    return {
        "id": raw["id"],
        "name": raw.get("name", f"Поток #{raw['id']}"),
        "position": raw.get("position", 0),
        "type": raw.get("type"),
        "state": raw.get("state"),
        "schema": raw.get("schema"),
        "action_type": raw.get("action_type"),
        "action_options": raw.get("action_options"),
        "action_payload": raw.get("action_payload"),
        "filters": raw.get("filters", []),
        "offers": rows,
        "editable": raw.get("schema") == "landings" and raw.get("state") != "deleted",
        "revision": stream_revision(raw),
    }


def present_streams(flows: list[dict], db: Session, offers_by_id: dict) -> list[dict]:
    ordered = sorted(
        flows,
        key=lambda value: (
            {"forced": 0, "regular": 1, "default": 2}.get(value.get("type"), 1),
            value.get("position", 0),
        ),
    )
    return [visible_stream(value, db, offers_by_id) for value in ordered]
