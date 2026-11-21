import os
import subprocess
import sys

import pytest

from app import main
from app.config import BACKEND_ROOT, Settings


@pytest.mark.parametrize(
    ("url", "key", "configured"),
    [
        ("https://tracker.example", "", False),
        ("https://your-tracker.example", "key", False),
        ("https://tracker.example", "   ", False),
        ("https://tracker.example", "key", True),
    ],
)
def test_health_exposes_configuration_without_secret(
    client, monkeypatch, url, key, configured
):
    settings = Settings(_env_file=None, keitaro_url=url, keitaro_api_key=key)
    monkeypatch.setattr(main, "get_settings", lambda: settings)
    result = client.get("/api/health").json()
    expected = configured
    assert result == {
        "status": "ok",
        "configured": expected,
        "tracker_url": url if expected else None,
    }
    assert "keitaro_api_key" not in result


def test_application_info_logs_are_visible_without_duplicate_handlers():
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from app.logging_setup import configure_logging; import logging; configure_logging('INFO'); configure_logging('INFO'); logging.getLogger('app.keitaro').info('test request visible')",
        ],
        env={**os.environ, "PYTHONPATH": str(BACKEND_ROOT)},
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stderr.count("test request visible") == 1
    assert "INFO app.keitaro" in result.stderr
