from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")
    database_url: str = "sqlite:///./adrobot.db"
    keitaro_url: str = "https://your-tracker.example"
    keitaro_api_key: SecretStr = SecretStr("")
    keitaro_timeout: float = 30
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    @property
    def configured(self) -> bool:
        return (
            bool(self.keitaro_api_key.get_secret_value().strip())
            and urlsplit(self.keitaro_url).hostname != "your-tracker.example"
        )

    @field_validator("database_url")
    @classmethod
    def resolve_database_path(cls, value: str) -> str:
        url = make_url(value)
        if (
            url.drivername.startswith("sqlite")
            and url.database
            and url.database != ":memory:"
            and url.query.get("uri") != "true"
            and not Path(url.database).is_absolute()
        ):
            return url.set(
                database=str((PROJECT_ROOT / url.database).resolve())
            ).render_as_string(hide_password=False)
        return value

    @field_validator("keitaro_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        parts = urlsplit(value)
        if (
            parts.scheme != "https"
            or not parts.netloc
            or parts.username
            or parts.query
            or parts.fragment
        ):
            raise ValueError(
                "KEITARO_URL должен быть HTTPS-адресом без логина, query и fragment"
            )
        return value.rstrip("/").removesuffix("/admin")


@lru_cache
def get_settings() -> Settings:
    return Settings()
