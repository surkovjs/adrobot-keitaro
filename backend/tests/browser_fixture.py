"""Disposable browser fixture: real application, real SQLite, simulated Keitaro.

Run from project root:
PYTHONPATH=backend:backend/tests .venv/bin/python backend/tests/browser_fixture.py
Only localhost is exposed. No production settings or databases are used.
"""

import argparse
import tempfile
from pathlib import Path
from typing import Annotated

import uvicorn
from fake_tracker import FakeBase, FakeEntity, FakeTracker
from fastapi import Depends
from sqlalchemy.orm import Session, sessionmaker

from app import main
from app.config import Settings
from app.db import Base, get_db, make_engine
from app.keitaro import KeitaroClient


def run(port: int):
    with tempfile.TemporaryDirectory(prefix="adrobot-browser-fixture-") as directory:
        engine = make_engine(f"sqlite:///{Path(directory) / 'test.db'}")
        Base.metadata.create_all(engine)
        FakeBase.metadata.create_all(engine)
        factory = sessionmaker(engine, expire_on_commit=False)
        with factory() as db:
            FakeTracker(db).seed()
            campaign = db.get(FakeEntity, "campaigns/101")
            campaign.payload = {
                **campaign.payload,
                "name": "TEST · test_surkov_simulation",
            }
            db.commit()

        def database():
            with factory() as db:
                yield db

        async def tracker(db: Annotated[Session, Depends(get_db)]):
            yield FakeTracker(db)

        async def forbid_real_api(*args, **kwargs):
            raise AssertionError("Real Keitaro access is forbidden in this fixture")

        KeitaroClient.request = forbid_real_api
        settings = Settings(
            _env_file=None,
            database_url=f"sqlite:///{Path(directory) / 'test.db'}",
            keitaro_url="https://mock-tracker.invalid",
            keitaro_api_key="test-only",
        )
        main.get_settings = lambda: settings
        main.app.dependency_overrides[get_db] = database
        main.app.dependency_overrides[main.get_client] = tracker
        try:
            uvicorn.run(main.app, host="127.0.0.1", port=port, log_level="warning")
        finally:
            main.app.dependency_overrides.clear()
            engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18002)
    run(parser.parse_args().port)
