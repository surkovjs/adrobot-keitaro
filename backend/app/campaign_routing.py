from fastapi import HTTPException

from app.keitaro import KeitaroError
from app.schemas import CampaignCreate

GOOGLE_URL = "https://google.com"


async def validate_references(data: CampaignCreate, client):
    references = {}
    for path, selected in [
        ("domains", data.domain_id),
        ("offers", data.offer_id),
        ("traffic_sources", data.traffic_source_id),
    ]:
        entity = await client.request("GET", f"{path}/{selected}")
        references[path] = entity
        if entity.get("state", "active") != "active":
            raise HTTPException(422, f"{path}: выбранный объект не активен")
    groups = await client.listing("groups?type=campaigns")
    if not any(
        int(v["id"]) == data.group_id and v.get("type") in (None, "campaigns")
        for v in groups
    ):
        raise HTTPException(422, "Выбранная группа кампаний не найдена")
    source = references["traffic_sources"]
    return source


def build_campaign_payload(data: CampaignCreate, alias: str, source: dict):
    payload = {
        "name": data.name,
        "alias": alias,
        "type": "position",
        "state": "disabled",
        "domain_id": data.domain_id,
        "group_id": data.group_id,
        "traffic_source_id": data.traffic_source_id,
        "cost_type": "CPC",
        "cost_value": 0,
        "cost_currency": "USD",
        "cost_auto": True,
    }
    if source.get("parameters"):
        payload["parameters"] = source["parameters"]
    return payload


async def create_streams(data: CampaignCreate, campaign_id: int, client):
    await client.request(
        "POST",
        "streams",
        {
            "campaign_id": campaign_id,
            "name": f"Geo {data.geo} → Google",
            "position": 1,
            "type": "regular",
            "state": "active",
            "schema": "redirect",
            "action_type": "http",
            "action_payload": GOOGLE_URL,
            "collect_clicks": True,
            "filter_or": False,
            "filters": [{"name": "country", "mode": "accept", "payload": [data.geo]}],
        },
    )
    await client.request(
        "POST",
        "streams",
        {
            "campaign_id": campaign_id,
            "name": "Офферы",
            "position": 2,
            "type": "default",
            "state": "active",
            "schema": "landings",
            "action_type": "http",
            "collect_clicks": True,
            "filters": [],
            "landings": [],
            "offers": [{"offer_id": data.offer_id, "share": 100, "state": "active"}],
        },
    )


async def verify_routing(data: CampaignCreate, campaign_id: int, client):
    verified = await client.listing(f"campaigns/{campaign_id}/streams")
    if len(verified) != 2:
        raise KeitaroError("Кампания создана, но проверка двух потоков не прошла")
    geo = next((v for v in verified if v.get("type") == "regular"), None)
    offer = next((v for v in verified if v.get("type") == "default"), None)
    expected_filter = {"name": "country", "mode": "accept", "payload": [data.geo]}
    geo_valid = bool(geo) and (
        geo.get("state") == "active"
        and geo.get("position") == 1
        and geo.get("schema") == "redirect"
        and geo.get("action_type") == "http"
        and geo.get("action_payload") == GOOGLE_URL
        and not geo.get("filter_or")
        and len(geo.get("filters", [])) == 1
        and all(geo["filters"][0].get(k) == v for k, v in expected_filter.items())
    )
    offer_valid = bool(offer) and (
        offer.get("state") == "active"
        and offer.get("schema") == "landings"
        and not offer.get("filters")
        and not offer.get("landings")
        and len(offer.get("offers", [])) == 1
        and int(offer["offers"][0]["offer_id"]) == data.offer_id
        and int(offer["offers"][0]["share"]) == 100
        and offer["offers"][0].get("state", "active") == "active"
    )
    if not geo_valid or not offer_valid:
        raise KeitaroError(
            "Кампания создана, но проверка маршрутизации не прошла. Проверьте её в Keitaro"
        )
