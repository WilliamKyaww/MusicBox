from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "MusicBox API"
    movies_enabled: bool = Field(default=False, alias="MOVIES_ENABLED")
    movies_tmdb_token: str = Field(default="", alias="MOVIES_TMDB_TOKEN")
    movies_media_dir: str = Field(default="", alias="MOVIES_MEDIA_DIR")
    movies_region: str = Field(default="GB", alias="MOVIES_REGION")
    movies_data_dir: Path = Field(
        default=BACKEND_DIR / "data" / "movies", alias="MOVIES_DATA_DIR"
    )
    frontend_origin: str = Field(
        default="http://localhost:5173",
        alias="FRONTEND_ORIGIN",
    )
    youtube_api_key: str = Field(default="", alias="YOUTUBE_API_KEY")
    spotify_client_id: str = Field(default="", alias="SPOTIFY_CLIENT_ID")
    spotify_client_secret: str = Field(default="", alias="SPOTIFY_CLIENT_SECRET")
    basic_auth_username: str = Field(default="", alias="MUSICBOX_AUTH_USERNAME")
    basic_auth_password: str = Field(default="", alias="MUSICBOX_AUTH_PASSWORD")
    discord_presence_enabled: bool = Field(
        default=False,
        alias="DISCORD_PRESENCE_ENABLED",
    )
    discord_client_id: str = Field(default="", alias="DISCORD_CLIENT_ID")
    youtube_api_base_url: str = "https://www.googleapis.com/youtube/v3"
    youtube_default_max_results: int = 12
    request_timeout_seconds: float = 15.0
    youtube_search_cache_ttl_seconds: int = Field(
        default=300,
        alias="YOUTUBE_SEARCH_CACHE_TTL_SECONDS",
    )
    ffmpeg_binary: str = Field(default="ffmpeg", alias="FFMPEG_BINARY")
    downloads_dir: Path = Field(
        default=BACKEND_DIR / "data" / "downloads",
        alias="DOWNLOADS_DIR",
    )
    playlists_dir: Path = Field(
        default=BACKEND_DIR / "data" / "playlists",
        alias="PLAYLISTS_DIR",
    )
    exports_dir: Path = Field(
        default=BACKEND_DIR / "data" / "exports",
        alias="EXPORTS_DIR",
    )
    discord_thumbnails_dir: Path = Field(
        default=BACKEND_DIR / "data" / "discord-thumbnails",
        alias="DISCORD_THUMBNAILS_DIR",
    )
    max_concurrent_downloads: int = Field(default=2, alias="MAX_CONCURRENT_DOWNLOADS")
    youtube_cookies_file: str = Field(default="", alias="YOUTUBE_COOKIES_FILE")
    po_token_server_url: str = Field(default="http://127.0.0.1:4416", alias="PO_TOKEN_SERVER_URL")

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
