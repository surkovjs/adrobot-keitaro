from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import router
from app.config import PROJECT_ROOT, get_settings
from app.dependencies import get_client  # noqa: F401 — dependency override entry point
from app.keitaro import KeitaroError
from app.logging_setup import configure_logging


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(get_settings().log_level)
    app.state.tracker = None
    try:
        yield
    finally:
        if app.state.tracker is not None:
            await app.state.tracker.close()


app = FastAPI(title="Adrobot API", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def local_write_guard(request: Request, call_next):
    # Prevent a third-party site from issuing writes to a local, unauthenticated app.
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin and origin.rstrip("/") not in {
            str(request.base_url).rstrip("/"),
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        }:
            return JSONResponse(
                {"detail": {"message": "Недопустимый источник запроса"}},
                status_code=403,
            )
        if request.headers.get("content-type", "").split(";")[0] != "application/json":
            return JSONResponse(
                {"detail": {"message": "Ожидается application/json"}}, status_code=415
            )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc: RequestValidationError):
    errors = [
        {
            "loc": list(v["loc"]),
            "msg": v["msg"].removeprefix("Value error, "),
            "type": v["type"],
        }
        for v in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "message": "; ".join(v["msg"] for v in errors),
                "errors": jsonable_encoder(errors),
            }
        },
    )


@app.exception_handler(HTTPException)
async def http_error(request, exc: HTTPException):
    detail = (
        exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
    )
    return JSONResponse(
        status_code=exc.status_code, content={"detail": detail}, headers=exc.headers
    )


@app.exception_handler(KeitaroError)
async def keitaro_error(request, exc: KeitaroError):
    return JSONResponse(
        status_code=exc.status, content={"detail": {"message": exc.message}}
    )


@app.get("/api/health")
def health():
    settings = get_settings()
    return {
        "status": "ok",
        "configured": settings.configured,
        "tracker_url": settings.keitaro_url if settings.configured else None,
    }


app.include_router(router)

DIST = PROJECT_ROOT / "frontend" / "dist"
if (DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/", include_in_schema=False)
@app.get("/campaigns", include_in_schema=False)
@app.get("/campaigns/new", include_in_schema=False)
@app.get("/campaigns/{campaign_id}", include_in_schema=False)
def frontend():
    if (DIST / "index.html").exists():
        return FileResponse(DIST / "index.html")
    return JSONResponse(
        {
            "message": "Соберите фронтенд: cd frontend && npm ci && npm run build. В разработке: npm run dev."
        }
    )
