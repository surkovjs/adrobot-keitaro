import asyncio
from functools import lru_cache

import pycountry
from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool

from app.dependencies import Client, Db, Key
from app.schemas import CampaignCreate, StreamUpdate
from app.services import create_campaign, update_stream
from app.streams import present_streams

router = APIRouter()


@lru_cache
def countries():
    return sorted(
        [{"code": v.alpha_2, "name": v.name} for v in pycountry.countries],
        key=lambda v: v["name"],
    )


def reference(item: dict):
    return {"id": int(item["id"]), "name": item.get("name", str(item["id"]))}


@router.get("/api/catalog")
async def catalog(client: Client):
    domains = await client.listing("domains")
    groups = await client.listing("groups?type=campaigns")
    sources = await client.listing("traffic_sources")
    return {
        "domains": [
            reference(v) for v in domains if v.get("state", "active") == "active"
        ],
        "groups": [
            reference(v) for v in groups if v.get("type") in (None, "campaigns")
        ],
        "sources": [
            reference(v) for v in sources if v.get("state", "active") == "active"
        ],
        "countries": countries(),
    }


@router.get("/api/offers")
async def offers(client: Client, q: str = ""):
    values = await client.listing("offers")
    search = q.strip().casefold()
    return [
        reference(v)
        for v in values
        if v.get("state", "active") == "active"
        and search in f"{v['id']} {v.get('name', '')}".casefold()
    ]


@router.get("/api/campaigns")
async def campaigns(client: Client, q: str = ""):
    values = await client.listing("campaigns")
    search = q.strip().casefold()
    return [
        {**reference(v), "state": v.get("state"), "alias": v.get("alias")}
        for v in values
        if v.get("state") != "deleted"
        and search in f"{v['id']} {v.get('name', '')}".casefold()
    ]


@router.post("/api/campaigns", status_code=201)
async def post_campaign(data: CampaignCreate, key: Key, client: Client, db: Db):
    return await create_campaign(data, key, client, db)


@router.get("/api/campaigns/{campaign_id}")
async def campaign(campaign_id: int, client: Client, db: Db):
    raw = await client.request("GET", f"campaigns/{campaign_id}")
    flows = await client.listing(f"campaigns/{campaign_id}/streams")
    flows = await asyncio.gather(
        *(client.request("GET", f"streams/{v['id']}") for v in flows)
    )
    offers = {int(v["id"]): v for v in await client.listing("offers")}
    return {
        **reference(raw),
        "state": raw.get("state"),
        "alias": raw.get("alias"),
        "streams": await run_in_threadpool(present_streams, flows, db, offers),
    }


@router.put("/api/campaigns/{campaign_id}/streams/{stream_id}")
async def put_stream(
    campaign_id: int,
    stream_id: int,
    data: StreamUpdate,
    key: Key,
    client: Client,
    db: Db,
):
    return await update_stream(campaign_id, stream_id, data, key, client, db)
