"""Settings that can be changed from the app's Settings page.

Values are stored in the same dotenv file the backend reads at start-up:
``backend/.env`` for the web app, or the desktop app's ``config.env``, whose
path the desktop launcher passes in ``MUSICBOX_CONFIG_FILE``. Secrets are
write-only: the API reports whether one is set, never its value.

To add a setting, add a ``SettingSpec`` to ``SPECS`` with the same name as the
field's alias in ``app.core.config.Settings``.
"""

from __future__ import annotations

import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any, Literal

from dotenv import dotenv_values

from app.core.config import BACKEND_DIR, Settings, get_settings

Kind = Literal["secret", "text", "boolean", "integer"]


@dataclass(frozen=True)
class SettingSpec:
    key: str
    label: str
    group: str
    kind: Kind
    description: str
    restart_required: bool = False
    minimum: int | None = None
    maximum: int | None = None
    max_length: int = 512
    pattern: str | None = None
    pattern_message: str = ""


GROUPS: dict[str, str] = {
    "youtube": "YouTube",
    "spotify": "Spotify Import",
    "discord": "Discord",
    "downloads": "Downloads",
    "movies": "Movies",
}

SPECS: tuple[SettingSpec, ...] = (
    SettingSpec(
        key="MOVIES_ENABLED",
        label="Movies experience",
        group="movies",
        kind="boolean",
        description=(
            "Enable Movies and TV with free creator-authorised streams, local files and optional TMDB discovery."
        ),
    ),
    SettingSpec(key="MOVIES_FREE_STREAMING_ENABLED", label="Free online films", group="movies", kind="boolean",
                description="Show the curated Blender Open Movies collection. Playback connects to the creator's service, uses your internet data and needs no paid API key. This is not every commercial film or series."),
    SettingSpec(key="MOVIES_TMDB_TOKEN", label="TMDB read access token", group="movies", kind="secret",
                description="Optional catalogue metadata, not film streams. Add your own API Read Access Token after reviewing TMDB's terms. Local titles work without it.", max_length=2048),
    SettingSpec(key="MOVIES_MEDIA_DIR", label="Movies media folder", group="movies", kind="text",
                description="Full path to a folder containing movies/episodes you are authorised to play. Files are registered explicitly, never scanned or copied automatically.", max_length=2048),
    SettingSpec(key="MOVIES_REGION", label="Movies region", group="movies", kind="text",
                description="Two-letter country code for release ratings and legal availability links, for example GB.",
                pattern=r"^[A-Z]{2}$", pattern_message="Use a two-letter uppercase country code, for example GB."),
    SettingSpec(
        key="YOUTUBE_API_KEY",
        label="YouTube Data API Key",
        group="youtube",
        kind="secret",
        description=(
            "Needed for search, trending videos and some channel details. Create a key for "
            "YouTube Data API v3 in the Google Cloud console."
        ),
        max_length=200,
        pattern=r"^[A-Za-z0-9_\-]{20,200}$",
        pattern_message="That doesn't look like a YouTube API key. Check for spaces or missing characters.",
    ),
    SettingSpec(
        key="YOUTUBE_SEARCH_CACHE_TTL_SECONDS",
        label="Search Cache Duration (Seconds)",
        group="youtube",
        kind="integer",
        description="Repeated searches within this time reuse earlier results, which saves API quota.",
        minimum=0,
        maximum=86_400,
    ),
    SettingSpec(
        key="YOUTUBE_COOKIES_FILE",
        label="Cookies File",
        group="youtube",
        kind="text",
        description=(
            "Optional. Path to a Netscape-format cookies file from your own YouTube session, "
            "for videos that need you to be signed in."
        ),
        max_length=1024,
    ),
    SettingSpec(
        key="SPOTIFY_CLIENT_ID",
        label="Client ID",
        group="spotify",
        kind="text",
        description="From an app in the Spotify developer dashboard. Used only to preview playlists you import.",
        max_length=128,
        pattern=r"^[A-Za-z0-9]{16,64}$",
        pattern_message="A Spotify client ID is letters and numbers only.",
    ),
    SettingSpec(
        key="SPOTIFY_CLIENT_SECRET",
        label="Client Secret",
        group="spotify",
        kind="secret",
        description="Paired with the client ID above.",
        max_length=128,
        pattern=r"^[A-Za-z0-9]{16,64}$",
        pattern_message="A Spotify client secret is letters and numbers only.",
    ),
    SettingSpec(
        key="DISCORD_PRESENCE_ENABLED",
        label="Discord Status",
        group="discord",
        kind="boolean",
        description="Show the song or video you are playing as your Discord status while Discord is open.",
    ),
    SettingSpec(
        key="DISCORD_CLIENT_ID",
        label="Discord Application ID",
        group="discord",
        kind="text",
        description="The application ID from the Discord developer portal.",
        max_length=32,
        pattern=r"^\d{5,32}$",
        pattern_message="A Discord application ID contains only digits.",
    ),
    SettingSpec(
        key="MAX_CONCURRENT_DOWNLOADS",
        label="Simultaneous Downloads",
        group="downloads",
        kind="integer",
        description="More parallel downloads finish sooner but use more bandwidth.",
        restart_required=True,
        minimum=1,
        maximum=8,
    ),
)

SPECS_BY_KEY = {spec.key: spec for spec in SPECS}
_FIELD_BY_ALIAS = {
    field.alias or name: name for name, field in Settings.model_fields.items()
}
_LINE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_BARE = re.compile(r"^[A-Za-z0-9_\-.:/@+,]*$")
_LOOPBACK = {"127.0.0.1", "::1", "localhost"}
_write_lock = Lock()


class SettingsError(ValueError):
    """A value the user entered can't be saved; the message is safe to show."""


def config_file() -> Path:
    configured = os.environ.get("MUSICBOX_CONFIG_FILE", "").strip()
    return Path(configured) if configured else BACKEND_DIR / ".env"


def _file_values(path: Path) -> dict[str, str]:
    """The file's values as python-dotenv reads them, which is how they are loaded."""
    if not path.exists():
        return {}
    return {key: value or "" for key, value in dotenv_values(path).items()}


def _quote(value: str) -> str:
    """Quote a value so python-dotenv reads it back unchanged."""
    if _BARE.match(value):
        return value
    if "'" not in value:
        return f"'{value}'"  # Single quotes are literal, which keeps Windows paths intact.
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _current(spec: SettingSpec) -> Any:
    field = _FIELD_BY_ALIAS.get(spec.key)
    return getattr(get_settings(), field) if field else os.environ.get(spec.key, "")


def read_only_reason(client_host: str | None) -> str | None:
    """Why settings can't be changed from this request, or None if they can."""
    if os.environ.get("MUSICBOX_SETTINGS_READ_ONLY", "").strip().lower() in {"1", "true", "yes"}:
        return "Settings are managed by the server's environment variables."
    if (client_host or "") not in _LOOPBACK:
        return "Settings can only be changed on the computer running MusicBox."
    path = config_file()
    folder = path.parent
    if not folder.exists() or not os.access(folder, os.W_OK):
        return f"MusicBox can't write to {folder}."
    if path.exists() and not os.access(path, os.W_OK):
        return f"MusicBox can't write to {path}."
    return None


def describe(client_host: str | None) -> dict[str, Any]:
    path = config_file()
    stored = _file_values(path)
    fields = []
    for spec in SPECS:
        value = _current(spec)
        # A variable set outside the file wins over it, so editing the file wouldn't help.
        locked = spec.key in os.environ and stored.get(spec.key) != os.environ[spec.key]
        fields.append(
            {
                "key": spec.key,
                "label": spec.label,
                "group": spec.group,
                "kind": spec.kind,
                "description": spec.description,
                "restart_required": spec.restart_required,
                "minimum": spec.minimum,
                "maximum": spec.maximum,
                "is_set": bool(value) if spec.kind != "boolean" else True,
                "value": None if spec.kind == "secret" else value,
                "locked": locked,
            }
        )
    return {
        "config_file": str(path),
        "read_only_reason": read_only_reason(client_host),
        "groups": [{"id": key, "label": label} for key, label in GROUPS.items()],
        "fields": fields,
    }


def validate(spec: SettingSpec, value: Any) -> str | None:
    if value is None:
        return None
    if spec.kind == "boolean":
        if not isinstance(value, bool):
            raise SettingsError(f"{spec.label} must be on or off.")
        return "true" if value else "false"
    if spec.kind == "integer":
        if isinstance(value, bool) or not isinstance(value, int):
            raise SettingsError(f"{spec.label} must be a whole number.")
        if spec.minimum is not None and value < spec.minimum:
            raise SettingsError(f"{spec.label} must be at least {spec.minimum}.")
        if spec.maximum is not None and value > spec.maximum:
            raise SettingsError(f"{spec.label} must be at most {spec.maximum}.")
        return str(value)
    if not isinstance(value, str):
        raise SettingsError(f"{spec.label} must be text.")
    text = value.strip()
    if not text:
        return None
    if len(text) > spec.max_length or _CONTROL.search(text):
        raise SettingsError(f"{spec.label} contains characters that can't be saved.")
    if spec.pattern and not re.match(spec.pattern, text):
        raise SettingsError(spec.pattern_message or f"{spec.label} isn't valid.")
    return text


def _write_file(path: Path, updates: dict[str, str | None]) -> None:
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    pending = dict(updates)
    output: list[str] = []
    for line in lines:
        match = _LINE.match(line)
        key = match.group(1) if match else None
        if key not in updates:
            output.append(line)
            continue
        if key not in pending:
            continue  # Drop duplicate assignments of a key being changed.
        value = pending.pop(key)
        if value is not None:
            output.append(f"{key}={_quote(value)}")
    output.extend(f"{key}={_quote(value)}" for key, value in pending.items() if value is not None)

    path.parent.mkdir(parents=True, exist_ok=True)
    # Write a temporary file and swap it in, so a crash can't leave a half-written file.
    handle, temp_name = tempfile.mkstemp(prefix=".settings-", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as temp:
            temp.write("\n".join(output) + "\n")
        os.replace(temp_name, path)
    except BaseException:
        Path(temp_name).unlink(missing_ok=True)
        raise


def update(values: dict[str, Any], client_host: str | None) -> dict[str, Any]:
    reason = read_only_reason(client_host)
    if reason:
        raise PermissionError(reason)
    stored = _file_values(config_file())
    updates: dict[str, str | None] = {}
    for key, value in values.items():
        spec = SPECS_BY_KEY.get(key)
        if spec is None:
            raise SettingsError(f"{key} isn't a setting that can be changed here.")
        if key in os.environ and stored.get(key) != os.environ[key]:
            raise SettingsError(f"{spec.label} is set by an environment variable, so it can't be changed here.")
        updates[key] = validate(spec, value)

    with _write_lock:
        _write_file(config_file(), updates)
        for key, value in updates.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        get_settings.cache_clear()
    return describe(client_host)
