import pytest
from fake_tracker import FakeBase, FakeTracker
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app, get_client


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    FakeBase.metadata.create_all(engine)
    with sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    engine.dispose()


@pytest.fixture
def client(db):
    def override_db():
        yield db

    async def override_client():
        yield FakeTracker(db)

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_client] = override_client
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
