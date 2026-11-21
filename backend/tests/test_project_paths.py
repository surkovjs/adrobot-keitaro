from sqlalchemy.engine import make_url

from app.config import BACKEND_ROOT, PROJECT_ROOT, Settings
from app.main import DIST


def test_configuration_and_assets_are_relative_to_project():
    assert Settings.model_config["env_file"] == PROJECT_ROOT / ".env"
    assert BACKEND_ROOT == PROJECT_ROOT / "backend"
    assert DIST == PROJECT_ROOT / "frontend" / "dist"


def test_relative_database_path_does_not_depend_on_working_directory(
    monkeypatch, tmp_path
):
    before = Settings(_env_file=None, database_url="sqlite:///./demo.db").database_url
    monkeypatch.chdir(tmp_path)
    after = Settings(_env_file=None, database_url="sqlite:///./demo.db").database_url
    assert before == after
    assert make_url(after).database == str(PROJECT_ROOT / "demo.db")


def test_absolute_and_memory_database_urls_are_preserved(tmp_path):
    absolute = f"sqlite:///{tmp_path / 'test.db'}"
    assert Settings(_env_file=None, database_url=absolute).database_url == absolute
    assert (
        Settings(_env_file=None, database_url="sqlite:///:memory:").database_url
        == "sqlite:///:memory:"
    )
