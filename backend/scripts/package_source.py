"""Build a source ZIP with dot-files, excluding local data and build artifacts.

Usage from project root: python backend/scripts/package_source.py
The working database and .env are never opened or removed.
"""

import argparse
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[2]
ROOT_FILES = {
    "README.md",
    "Dockerfile",
    "compose.yaml",
    ".env.example",
    ".gitignore",
    ".dockerignore",
    "LICENSE",
    "LICENSE.md",
}
SOURCE_DIRS = {"backend", "frontend", ".github", "docs"}
EXCLUDED_DIRS = {
    "node_modules",
    "dist",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    "__MACOSX",
    ".venv",
    ".git",
}
REQUIRED = {
    ".env.example",
    ".gitignore",
    ".dockerignore",
    "frontend/index.html",
    "frontend/package-lock.json",
    "backend/requirements.lock.txt",
}


def source_file(path: Path) -> bool:
    if not path.parts or path.is_absolute() or ".." in path.parts:
        return False
    if len(path.parts) == 1 and path.name not in ROOT_FILES:
        return False
    if len(path.parts) > 1 and path.parts[0] not in SOURCE_DIRS:
        return False
    if EXCLUDED_DIRS.intersection(path.parts):
        return False
    name = path.name
    return not (
        name.startswith("._")
        or name == ".DS_Store"
        or ".db-" in name
        or ".db." in name
        or (name.startswith(".env") and name != ".env.example")
        or name.endswith(
            (
                ".pyc",
                ".tsbuildinfo",
                ".zip",
                ".tar",
                ".gz",
                ".db",
                ".sqlite",
                ".sqlite3",
                ".db-wal",
                ".db-shm",
                ".db-journal",
            )
        )
    )


def build_archive(root: Path, output: Path) -> list[str]:
    listed = (
        subprocess.check_output(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=root,
        )
        .decode()
        .split("\0")
    )
    paths = sorted(
        {
            name
            for name in listed
            if name
            and source_file(Path(name))
            and (root / name).is_file()
            and not (root / name).is_symlink()
        }
    )
    missing = REQUIRED - set(paths)
    if missing:
        raise RuntimeError(
            f"Required files missing from source export: {sorted(missing)}"
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for name in paths:
            archive.write(root / name, arcname=f"adrobot/{name}")
    with ZipFile(output) as archive:
        assert archive.testzip() is None
        assert all(
            source_file(Path(name).relative_to("adrobot"))
            for name in archive.namelist()
        )
    return paths


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=ROOT / "output" / "adrobot-source.zip"
    )
    args = parser.parse_args()
    files = build_archive(ROOT, args.output)
    print(
        f"{args.output}: {len(files)} source files, required dot-files included; local database, secrets and caches excluded"
    )
