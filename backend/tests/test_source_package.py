from pathlib import Path
from zipfile import ZipFile

import pytest

from scripts.package_source import REQUIRED, build_archive, source_file


@pytest.mark.parametrize(
    "name",
    [
        "adrobot.db",
        "backend/history.db-wal",
        "frontend/tsconfig.tsbuildinfo",
        "frontend/node_modules/a.js",
        "backend/.pytest_cache/data",
        "frontend/__MACOSX/._file",
        ".env",
        "backend/.env.local",
        "output/report.json",
    ],
)
def test_local_data_is_not_source(name):
    assert not source_file(Path(name))


def test_source_archive_keeps_dotfiles_and_excludes_forced_local_data(
    tmp_path, monkeypatch
):
    from scripts import package_source

    paths = set(REQUIRED) | {
        "README.md",
        "adrobot.db",
        ".env",
        "frontend/tsconfig.tsbuildinfo",
        "backend/__pycache__/app.pyc",
    }
    for name in paths:
        file = tmp_path / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text("private data" if name in {"adrobot.db", ".env"} else "source")
    monkeypatch.setattr(
        package_source.subprocess,
        "check_output",
        lambda *args, **kwargs: "\0".join(paths).encode(),
    )
    archive = tmp_path / "result.zip"
    exported = build_archive(tmp_path, archive)
    assert REQUIRED <= set(exported)
    assert "adrobot.db" not in exported
    with ZipFile(archive) as zipped:
        assert "adrobot/.env.example" in zipped.namelist()
        assert all(zipped.read(name) != b"private data" for name in zipped.namelist())


def test_missing_template_fails_instead_of_producing_incomplete_archive(
    tmp_path, monkeypatch
):
    from scripts import package_source

    monkeypatch.setattr(
        package_source.subprocess, "check_output", lambda *args, **kwargs: b""
    )
    with pytest.raises(RuntimeError, match="Required files missing"):
        build_archive(tmp_path, tmp_path / "result.zip")
