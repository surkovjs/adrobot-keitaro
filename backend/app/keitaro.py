import copy
import json
import logging
import time
from typing import Any, Protocol

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)


class TrackerClient(Protocol):
    async def request(
        self, method: str, path: str, payload: dict | None = None
    ) -> Any: ...
    async def listing(self, path: str) -> list[dict]: ...
    async def close(self): ...


class KeitaroError(Exception):
    def __init__(self, message: str, status: int = 502, *, ambiguous: bool = False):
        self.message = message
        self.status = status
        self.ambiguous = ambiguous
        super().__init__(message)


class KeitaroClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._catalog_cache = {}
        self.client = httpx.AsyncClient(
            base_url=settings.keitaro_url + "/admin_api/v1/",
            headers={
                "Api-Key": settings.keitaro_api_key.get_secret_value(),
                "Accept": "application/json",
            },
            timeout=settings.keitaro_timeout,
            follow_redirects=False,
        )

    async def close(self):
        await self.client.aclose()

    async def request(self, method: str, path: str, payload: dict | None = None):
        if not self.settings.keitaro_api_key.get_secret_value():
            raise KeitaroError("API-ключ Keitaro не настроен в .env", 503)
        if not self.settings.configured:
            raise KeitaroError("Адрес Keitaro не настроен в .env", 503)
        logger.info("Keitaro request method=%s path=%s", method, path.split("?")[0])
        writing = method not in {"GET", "HEAD", "OPTIONS"}
        if writing:
            self._catalog_cache.clear()
        try:
            response = await self.client.request(method, path.lstrip("/"), json=payload)
        except (httpx.ConnectTimeout, httpx.PoolTimeout, httpx.ConnectError) as exc:
            logger.warning(
                "Keitaro connection unavailable method=%s path=%s",
                method,
                path.split("?")[0],
            )
            # No connection/request slot was obtained: the write was not sent.
            raise KeitaroError(
                "Не удалось установить соединение с Keitaro", 503
            ) from exc
        except httpx.TimeoutException as exc:
            logger.warning(
                "Keitaro timeout method=%s path=%s", method, path.split("?")[0]
            )
            raise KeitaroError(
                "Keitaro не ответил вовремя. Результат записи может быть неизвестен; обновите данные перед повтором.",
                504,
                ambiguous=writing,
            ) from exc
        except httpx.HTTPError as exc:
            logger.warning(
                "Keitaro transport failure method=%s path=%s ambiguous=%s",
                method,
                path.split("?")[0],
                writing,
            )
            # Read/write/protocol failures can happen after the server applied a write.
            raise KeitaroError(
                "Соединение с Keitaro прервано", ambiguous=writing
            ) from exc
        logger.info(
            "Keitaro response method=%s status=%s", method, response.status_code
        )
        if response.status_code >= 300:
            # Only explicit refusals establish that no write was applied.
            ambiguous = writing and response.status_code not in {
                400,
                401,
                402,
                403,
                404,
                405,
                406,
                409,
                410,
                413,
                415,
                422,
                429,
            }
            if response.status_code in (401, 403):
                raise KeitaroError(
                    "Keitaro отклонил доступ. Проверьте API-ключ и права пользователя."
                )
            if response.status_code == 404:
                raise KeitaroError("Объект не найден в Keitaro", 404)
            try:
                detail = json.dumps(response.json(), ensure_ascii=False)[:600]
                detail = detail.replace(
                    self.settings.keitaro_api_key.get_secret_value(), "[hidden]"
                )
            except ValueError:
                detail = "Неожиданный ответ сервера"
            raise KeitaroError(
                f"Keitaro вернул {response.status_code}: {detail}",
                422
                if response.status_code in (400, 406, 422)
                else 503
                if response.status_code in (402, 429)
                else 502,
                ambiguous=ambiguous,
            )
        try:
            return response.json()
        except ValueError as exc:
            raise KeitaroError(
                "Keitaro вернул ответ, который не является JSON", ambiguous=writing
            ) from exc

    async def listing(self, path: str) -> list[dict]:
        cacheable = path in {
            "offers",
            "domains",
            "groups?type=campaigns",
            "traffic_sources",
        }
        cached = self._catalog_cache.get(path)
        if cacheable and cached and cached[0] > time.monotonic():
            return copy.deepcopy(cached[1])
        result = await self.request("GET", path)
        if not isinstance(result, list):
            raise KeitaroError(f"Неожиданный формат списка {path}")
        if cacheable:
            self._catalog_cache[path] = (time.monotonic() + 15, result)
        return copy.deepcopy(result)
