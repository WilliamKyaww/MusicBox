import base64
import binascii
import secrets
from pathlib import Path

try:
    import truststore
except ImportError:  # pragma: no cover - optional on hosts with a complete CA bundle
    truststore = None
else:
    # Verify TLS against the OS certificate store instead of certifi's bundle, so
    # HTTPS works on machines where antivirus or a proxy re-signs traffic. This has
    # to run before httpx or yt-dlp build their SSL contexts.
    truststore.inject_into_ssl()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from starlette.requests import Request

from app.api.router import api_router
from app.core.config import get_settings

settings = get_settings()
STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(
    title=settings.app_name,
    description="Search, MP3 download, playlist, and playback API for the MusicBox personal project.",
    version="0.2.0",
)

allowed_origins = {
    settings.frontend_origin,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def optional_basic_auth(request: Request, call_next):
    if not settings.basic_auth_username or not settings.basic_auth_password:
        return await call_next(request)

    if request.url.path == "/api/health":
        return await call_next(request)

    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")

    if scheme.lower() == "basic" and token:
        try:
            decoded = base64.b64decode(token).decode("utf-8")
            username, _, password = decoded.partition(":")
        except (binascii.Error, UnicodeDecodeError):
            username = ""
            password = ""

        username_matches = secrets.compare_digest(username, settings.basic_auth_username)
        password_matches = secrets.compare_digest(password, settings.basic_auth_password)

        if username_matches and password_matches:
            return await call_next(request)

    return Response(
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="MusicBox"'},
    )

app.include_router(api_router, prefix="/api")


@app.get("/api/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
