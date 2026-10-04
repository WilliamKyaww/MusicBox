from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core import editable_settings as store
from app.core.config import get_settings

router = APIRouter()

# Browsers can't add a custom header to a cross-site request without a CORS
# preflight, which the backend only grants to its own front ends. Requiring it
# stops other websites from changing settings through the user's browser.
GUARD_HEADER = "X-MusicBox-Settings"
KEY_CHECK_URL = "https://www.googleapis.com/youtube/v3/videos"
KEY_CHECK_VIDEO = "dQw4w9WgXcQ"


class SettingsUpdate(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)


class YouTubeKeyCheck(BaseModel):
    api_key: str | None = Field(default=None, max_length=200)


class KeyCheckResult(BaseModel):
    ok: bool
    message: str


def _client_host(request: Request) -> str | None:
    return request.client.host if request.client else None


def _require_guard(request: Request) -> None:
    if request.headers.get(GUARD_HEADER) != "1":
        raise HTTPException(status_code=403, detail="This request must come from the MusicBox app.")


@router.get("/settings")
async def read_settings(request: Request) -> dict[str, Any]:
    return store.describe(_client_host(request))


@router.put("/settings")
async def save_settings(request: Request, body: SettingsUpdate) -> dict[str, Any]:
    _require_guard(request)
    try:
        return store.update(body.values, _client_host(request))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except store.SettingsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _google_reason(response: httpx.Response) -> str:
    try:
        error = response.json().get("error", {})
    except ValueError:
        return ""
    reasons = [item.get("reason", "") for item in error.get("details", []) if isinstance(item, dict)]
    reasons += [item.get("reason", "") for item in error.get("errors", []) if isinstance(item, dict)]
    return " ".join(reason for reason in reasons if reason)


@router.post("/settings/youtube-key-check", response_model=KeyCheckResult)
async def check_youtube_key(request: Request, body: YouTubeKeyCheck) -> KeyCheckResult:
    """Checks a pasted key (or the saved one) with a one-unit YouTube API call."""
    _require_guard(request)
    candidate = (body.api_key or "").strip()
    if candidate:
        try:
            store.validate(store.SPECS_BY_KEY["YOUTUBE_API_KEY"], candidate)
        except store.SettingsError as exc:
            return KeyCheckResult(ok=False, message=str(exc))
    key = candidate or get_settings().youtube_api_key
    if not key:
        return KeyCheckResult(ok=False, message="No YouTube API key has been saved yet.")

    try:
        async with httpx.AsyncClient(timeout=get_settings().request_timeout_seconds) as client:
            response = await client.get(
                KEY_CHECK_URL,
                params={"part": "id", "id": KEY_CHECK_VIDEO},
                headers={"X-Goog-Api-Key": key},
            )
    except httpx.HTTPError:
        return KeyCheckResult(ok=False, message="Couldn't reach YouTube. Check your internet connection.")

    if response.status_code == 200:
        return KeyCheckResult(ok=True, message="The key works.")
    reason = _google_reason(response)
    if "quotaExceeded" in reason or "dailyLimitExceeded" in reason:
        return KeyCheckResult(ok=True, message="The key is valid, but today's quota is used up.")
    if "SERVICE_DISABLED" in reason or "accessNotConfigured" in reason:
        return KeyCheckResult(
            ok=False,
            message="The key is valid, but YouTube Data API v3 isn't enabled for its Google Cloud project.",
        )
    if "BLOCKED" in reason or "Blocked" in reason:
        return KeyCheckResult(ok=False, message="The key's restrictions block MusicBox. Allow YouTube Data API v3.")
    return KeyCheckResult(ok=False, message="YouTube rejected this key.")
