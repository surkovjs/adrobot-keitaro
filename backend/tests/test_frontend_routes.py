import pytest

from app import main


@pytest.mark.parametrize(
    "path", ["/", "/campaigns", "/campaigns/new", "/campaigns/101"]
)
def test_deep_links_serve_frontend(client, monkeypatch, tmp_path, path):
    (tmp_path / "index.html").write_text("<!doctype html><div id='root'>app</div>")
    monkeypatch.setattr(main, "DIST", tmp_path)
    response = client.get(path)
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "id='root'" in response.text


def test_frontend_does_not_mask_missing_api_or_assets(client):
    assert client.get("/api/not-found").status_code == 404
    assert client.get("/assets/not-found.js").status_code == 404
