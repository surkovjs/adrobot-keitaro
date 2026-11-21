"""Test the running application against real Keitaro using a new isolated campaign.

Run from the project root after starting the backend. Existing campaigns are never
edited. The new test campaign is disabled during editing and archived in finally.
"""

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.config import get_settings
from app.keitaro import KeitaroClient, KeitaroError
from app.streams import stream_settings


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--report", type=Path, default=Path("output/live-api-test/recheck.json")
    )
    args = parser.parse_args()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    report = {"checks": [], "limitations": [], "campaign_id": None, "archived": False}
    remote = KeitaroClient(get_settings())
    local = httpx.AsyncClient(base_url=args.base_url.rstrip("/") + "/api/", timeout=45)
    name = (
        f"test_surkov_integration_{datetime.now(UTC):%Y%m%d_%H%M%S}_{uuid4().hex[:6]}"
    )

    def record(label, passed):
        report["checks"].append({"name": label, "passed": bool(passed)})
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(("PASS " if passed else "FAIL ") + label, flush=True)
        if not passed:
            raise AssertionError(label)

    async def request(method, path, body=None, *, key=None, expected=200):
        response = await local.request(
            method,
            path,
            json=body,
            headers={"Idempotency-Key": key or str(uuid4())}
            if method in ("POST", "PUT")
            else {},
        )
        if response.status_code != expected:
            raise RuntimeError(
                f"{method} {path}: {response.status_code}: {response.text[:1000]}"
            )
        return response.json()

    def row(oid, share, *, locked=False, removed=False):
        return {"offer_id": oid, "share": share, "locked": locked, "removed": removed}

    async def editor():
        data = await request("GET", f"campaigns/{report['campaign_id']}")
        return next(stream for stream in data["streams"] if stream["editable"])

    async def save(rows):
        current = await editor()
        body = {"revision": current["revision"], "offers": rows}
        key = str(uuid4())
        path = f"campaigns/{report['campaign_id']}/streams/{current['id']}"
        saved = await request("PUT", path, body, key=key)
        assert await request("PUT", path, body, key=key) == saved
        return saved

    try:
        catalog = await request("GET", "catalog")
        offers = await request("GET", "offers")
        record("catalog and offers", bool(catalog["domains"]) and bool(offers))
        group = next(v for v in catalog["groups"] if v["name"] == "FORTESTS")
        source = next(v for v in catalog["sources"] if v["name"] == "FORTESTS")
        ids = [int(v["id"]) for v in offers[:3]]
        payload = {
            "name": name,
            "geo": "AU",
            "offer_id": ids[0],
            "domain_id": catalog["domains"][0]["id"],
            "group_id": group["id"],
            "traffic_source_id": source["id"],
        }
        key = str(uuid4())
        # Capture the ID even if the application reports a partial creation.
        response = await local.post(
            "campaigns", json=payload, headers={"Idempotency-Key": key}
        )
        data = response.json()
        report["campaign_id"] = data.get("id") or data.get("detail", {}).get(
            "campaign_id"
        )
        record("campaign created", response.status_code == 201)
        cid = report["campaign_id"]
        actual = await remote.request("GET", f"campaigns/{cid}")
        record(
            "active campaign and references",
            actual["state"] == "active"
            and all(
                int(actual[k]) == payload[k]
                for k in ("domain_id", "group_id", "traffic_source_id")
            ),
        )
        await remote.request("PUT", f"campaigns/{cid}", {"state": "disabled"})
        record(
            "creation idempotency",
            await request("POST", "campaigns", payload, key=key, expected=201) == data,
        )
        await request(
            "POST",
            "campaigns",
            {**payload, "name": name + "_changed"},
            key=key,
            expected=409,
        )
        record("creation key conflict", True)
        flows = await remote.listing(f"campaigns/{cid}/streams")
        record("exactly two streams", len(flows) == 2)
        geo = next(v for v in flows if v["type"] == "regular")
        record(
            "country to Google",
            geo["action_payload"] == "https://google.com"
            and any(
                f["name"] == "country"
                and f["mode"] == "accept"
                and f["payload"] == ["AU"]
                for f in geo["filters"]
            ),
        )
        before = await remote.request("GET", f"streams/{(await editor())['id']}")
        await save([row(ids[0], 100, locked=True)])
        record("pinned share survives reload", (await editor())["offers"][0]["locked"])
        await save([row(ids[0], 100)])
        record("unpin saved", not (await editor())["offers"][0]["locked"])
        if len(ids) > 1:
            shares = [
                100 // len(ids) + (1 if i < 100 % len(ids) else 0)
                for i in range(len(ids))
            ]
            await save(
                [row(oid, share) for oid, share in zip(ids, shares, strict=True)]
            )
            record(
                "add offers and integer shares",
                sum(v["share"] for v in (await editor())["offers"]) == 100,
            )
            pinned = [row(ids[0], 25, locked=True)]
            free = len(ids) - 1
            pinned += [
                row(oid, 75 // free + (1 if i < 75 % free else 0))
                for i, oid in enumerate(ids[1:])
            ]
            await save(pinned)
            record("pin and redistribute", (await editor())["offers"][0]["locked"])
            # Remove an offer that has already been saved, then restore after reload.
            await save(
                [row(ids[0], 100)] + [row(oid, 0, removed=True) for oid in ids[1:]]
            )
            record(
                "removed offers survive reload",
                all(v["removed"] for v in (await editor())["offers"][1:]),
            )
            await save(pinned)
            record(
                "restore and pinned distribution",
                [v["share"] for v in (await editor())["offers"]]
                == [v["share"] for v in pinned],
            )
        else:
            report["limitations"].append(
                "Only one accessible offer: live add/remove/restore and multi-offer redistribution not covered."
            )
        current = await editor()
        path = f"campaigns/{cid}/streams/{current['id']}"
        await request(
            "PUT",
            path,
            {"revision": current["revision"], "offers": [row(ids[0], 99)]},
            expected=422,
        )
        record("invalid distribution rejected", True)
        await remote.request(
            "PUT",
            f"streams/{current['id']}",
            {"comments": "test_surkov concurrent change"},
        )
        await request(
            "PUT",
            path,
            {"revision": current["revision"], "offers": [row(ids[0], 100)]},
            expected=409,
        )
        record("stale revision rejected", True)
        await remote.request(
            "PUT",
            f"streams/{current['id']}",
            {"comments": before.get("comments") or ""},
        )
        after = await remote.request("GET", f"streams/{current['id']}")
        record(
            "non-offer settings preserved",
            stream_settings(before) == stream_settings(after),
        )
        record(
            "other stream unchanged",
            stream_settings(geo)
            == stream_settings(await remote.request("GET", f"streams/{geo['id']}")),
        )
        record(
            "disabled campaign stays disabled",
            (await remote.request("GET", f"campaigns/{cid}"))["state"] == "disabled",
        )
        report["status"] = (
            "passed_with_limitations" if report["limitations"] else "passed"
        )
    except Exception as exc:
        report["status"] = "failed"
        report["error"] = str(exc)
        raise
    finally:
        try:
            if report["campaign_id"] is not None:
                cid = report["campaign_id"]
                try:
                    current = await remote.request("GET", f"campaigns/{cid}")
                    if current.get("name") != name:
                        raise RuntimeError(
                            "Cleanup refused: campaign name does not match this run"
                        )
                    await remote.request("DELETE", f"campaigns/{cid}")
                    current = await remote.request("GET", f"campaigns/{cid}")
                    report["archived"] = current.get("state") == "deleted"
                except KeitaroError as exc:
                    if exc.status != 404:
                        raise
                    report["archived"] = True
                record("test campaign archived", report["archived"])
        except Exception as exc:
            report["cleanup_error"] = str(exc)
            report["status"] = "failed"
            raise
        finally:
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2))
            print(f"Report: {args.report}", flush=True)
            await local.aclose()
            await remote.close()


if __name__ == "__main__":
    asyncio.run(main())
