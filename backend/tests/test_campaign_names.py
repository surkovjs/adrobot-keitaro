import pytest

from app.schemas import CampaignCreate


@pytest.mark.parametrize("name", ["campaign1", "test_surkov_campaign1", "x" * 200])
def test_campaign_name_is_not_rewritten(name):
    campaign = CampaignCreate(
        name=name, geo="AU", offer_id=1, domain_id=1, group_id=1, traffic_source_id=1
    )
    assert campaign.name == name
