import httpx
import pytest

from app.config import Settings
from app.keitaro import KeitaroClient, KeitaroError


async def adapter(handler):
    value = KeitaroClient(
        Settings(
            _env_file=None,
            keitaro_url="https://tracker.example",
            keitaro_api_key="secret-test-key",
        )
    )
    await value.client.aclose()
    value.client = httpx.AsyncClient(
        base_url="https://tracker.example/admin_api/v1/",
        transport=httpx.MockTransport(handler),
    )
    return value


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("remote", "local"),
    [
        (401, 502),
        (403, 502),
        (404, 404),
        (422, 422),
        (429, 503),
        (500, 502),
        (302, 502),
    ],
)
async def test_http_status_mapping_and_secret_masking(remote, local):
    value = await adapter(
        lambda req: httpx.Response(remote, json={"error": "secret-test-key"})
    )
    try:
        with pytest.raises(KeitaroError) as exc:
            await value.request("GET", "offers")
        assert exc.value.status == local
        assert "secret-test-key" not in exc.value.message
    finally:
        await value.close()


@pytest.mark.asyncio
async def test_catalog_cache_is_copied_and_invalidated_by_write():
    calls = []

    def handler(req):
        calls.append(req.method)
        return httpx.Response(
            200,
            json=[{"id": 301, "name": "Offer"}] if req.method == "GET" else {"id": 301},
        )

    value = await adapter(handler)
    try:
        rows = await value.listing("offers")
        rows[0]["name"] = "Mutated"
        assert (await value.listing("offers"))[0]["name"] == "Offer"
        assert calls == ["GET"]
        await value.request("PUT", "offers/301", {"name": "New"})
        await value.listing("offers")
        assert calls == ["GET", "PUT", "GET"]
    finally:
        await value.close()


@pytest.mark.asyncio
async def test_timeout_and_invalid_json():
    def timeout(req):
        raise httpx.ReadTimeout("timeout", request=req)

    value = await adapter(timeout)
    try:
        with pytest.raises(KeitaroError) as exc:
            await value.request("POST", "campaigns", {})
        assert exc.value.status == 504
    finally:
        await value.close()
    value = await adapter(lambda req: httpx.Response(200, text="not json"))
    try:
        with pytest.raises(KeitaroError, match="JSON"):
            await value.request("GET", "offers")
    finally:
        await value.close()


@pytest.mark.parametrize(
    "url",
    [
        "http://tracker.example",
        "https://user:pass@tracker.example",
        "https://tracker.example?key=1",
        "https://tracker.example/#x",
    ],
)
def test_invalid_tracker_url(url):
    with pytest.raises(ValueError):
        Settings(_env_file=None, keitaro_url=url)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("exception", "ambiguous"),
    [
        (httpx.ConnectError, False),
        (httpx.ConnectTimeout, False),
        (httpx.PoolTimeout, False),
        (httpx.ReadTimeout, True),
        (httpx.WriteTimeout, True),
        (httpx.ReadError, True),
        (httpx.WriteError, True),
        (httpx.RemoteProtocolError, True),
    ],
)
async def test_write_transport_error_classification(exception, ambiguous):
    def handler(request):
        raise exception("transport failure", request=request)

    value = await adapter(handler)
    try:
        with pytest.raises(KeitaroError) as exc:
            await value.request("PUT", "streams/202", {"offers": []})
        assert exc.value.ambiguous is ambiguous
    finally:
        await value.close()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "ambiguous"),
    [
        (400, False),
        (401, False),
        (403, False),
        (409, False),
        (422, False),
        (429, False),
        (408, True),
        (500, True),
        (502, True),
        (503, True),
    ],
)
async def test_write_http_error_classification(status, ambiguous):
    value = await adapter(
        lambda request: httpx.Response(status, json={"message": "Rejected"})
    )
    try:
        with pytest.raises(KeitaroError) as exc:
            await value.request("POST", "campaigns", {})
        assert exc.value.ambiguous is ambiguous
    finally:
        await value.close()


@pytest.mark.asyncio
async def test_non_json_write_response_is_ambiguous_and_cache_clears_on_timeout():
    value = await adapter(lambda request: httpx.Response(200, text="invalid"))
    try:
        with pytest.raises(KeitaroError) as exc:
            await value.request("POST", "campaigns", {})
        assert exc.value.ambiguous is True
    finally:
        await value.close()
    calls = []

    def handler(request):
        calls.append(request.method)
        if request.method == "PUT":
            raise httpx.ReadTimeout("Lost", request=request)
        return httpx.Response(200, json=[{"id": 301}])

    value = await adapter(handler)
    try:
        await value.listing("offers")
        with pytest.raises(KeitaroError):
            await value.request("PUT", "offers/301", {})
        await value.listing("offers")
        assert calls == ["GET", "PUT", "GET"]
    finally:
        await value.close()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("url", "key"),
    [("https://tracker.example", ""), ("https://your-tracker.example", "key")],
)
async def test_unconfigured_adapter_does_not_send_request(url, key):
    value = KeitaroClient(
        Settings(_env_file=None, keitaro_url=url, keitaro_api_key=key)
    )
    await value.client.aclose()

    def handler(request):
        pytest.fail("Unconfigured tracker must not receive requests")

    value.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    try:
        with pytest.raises(KeitaroError) as exc:
            await value.request("GET", "offers")
        assert exc.value.status == 503
        assert exc.value.ambiguous is False
    finally:
        await value.close()
