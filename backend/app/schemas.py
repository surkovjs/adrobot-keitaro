from typing import Annotated

import pycountry
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PositiveId = Annotated[int, Field(gt=0, strict=True)]


class CampaignCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    geo: str
    offer_id: PositiveId
    domain_id: PositiveId
    group_id: PositiveId
    traffic_source_id: PositiveId

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str):
        if not value.strip():
            raise ValueError("Введите название кампании")
        return value.strip()

    @field_validator("geo")
    @classmethod
    def validate_geo(cls, value: str):
        code = value.strip().upper()
        if not pycountry.countries.get(alpha_2=code):
            raise ValueError("Укажите один ISO-код страны, например AU, MX или RO")
        return code


class OfferShare(BaseModel):
    model_config = ConfigDict(extra="forbid")
    offer_id: PositiveId
    share: Annotated[int, Field(ge=0, le=100, strict=True)]
    removed: bool = False
    locked: bool = False


class StreamUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: str = Field(pattern=r"^[a-f0-9]{64}$")
    offers: list[OfferShare] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def check_distribution(self):
        ids = [row.offer_id for row in self.offers]
        if len(ids) != len(set(ids)):
            raise ValueError("Оффер не может повторяться в потоке")
        active = [row for row in self.offers if not row.removed]
        if not active or sum(row.share for row in active) != 100:
            raise ValueError("Сумма долей активных офферов должна быть 100%")
        if any(row.share == 0 for row in active):
            raise ValueError("Активному офферу нужна доля не меньше 1%")
        if any(row.share != 0 or row.locked for row in self.offers if row.removed):
            raise ValueError("Удалённый оффер должен иметь долю 0% и не быть закреплён")
        return self
