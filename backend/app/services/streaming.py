"""Streaming service — extracts direct audio/video URLs via yt-dlp."""

import html
import threading
import time
from dataclasses import dataclass

from app.core.config import get_settings

try:
    import yt_dlp
except ImportError:
    yt_dlp = None


class StreamingError(RuntimeError):
    """Raised when audio streaming fails."""


@dataclass(slots=True)
class _CachedStreamUrl:
    url: str
    expires_at: float
    title: str
    duration: int | None


_stream_cache: dict[str, _CachedStreamUrl] = {}
_cache_lock = threading.RLock()
CACHE_TTL_SECONDS = 3600  # 1 hour (YouTube URLs typically expire in ~6 hours)
# Progressive formats carry audio and video in one file, which is all a browser
# `<video>` element can handle without a DASH/MSE player.
MUXED_FORMAT_SELECTOR = (
    "best[vcodec!=none][acodec!=none][ext=mp4]/best[vcodec!=none][acodec!=none]/best"
)


def _decode_text(value: object, fallback: str = "") -> str:
    text = str(value if value is not None else fallback)
    return html.unescape(text)


def _extract_info(video_id: str, format_selector: str, media_label: str) -> dict:
    settings = get_settings()
    ffmpeg_binary = settings.ffmpeg_binary.strip() or "ffmpeg"

    ydl_opts = {
        "format": format_selector,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "ffmpeg_location": ffmpeg_binary,
    }

    if settings.youtube_cookies_file:
        ydl_opts["cookiefile"] = settings.youtube_cookies_file

    if settings.po_token_server_url:
        ydl_opts["extractor_args"] = {
            "youtubepot-bgutilhttp": {
                "base_url": [settings.po_token_server_url],
            },
        }

    source_url = f"https://www.youtube.com/watch?v={video_id}"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(source_url, download=False)
    except Exception as exc:
        raise StreamingError(f"Failed to extract {media_label} URL: {exc}") from exc

    if not info:
        raise StreamingError("yt-dlp returned no info for this video.")

    return info


def _cache_stream_url(cache_key: str, url: str, title: str, duration: int | None) -> None:
    with _cache_lock:
        _stream_cache[cache_key] = _CachedStreamUrl(
            url=url,
            expires_at=time.time() + CACHE_TTL_SECONDS,
            title=title,
            duration=duration,
        )

        # Clean expired entries
        now = time.time()
        expired = [k for k, v in _stream_cache.items() if v.expires_at <= now]
        for k in expired:
            _stream_cache.pop(k, None)


def _read_cached_stream_url(cache_key: str) -> tuple[str, str] | None:
    with _cache_lock:
        cached = _stream_cache.get(cache_key)
        if cached and cached.expires_at > time.time():
            return cached.url, cached.title

    return None


def get_audio_stream_url(video_id: str) -> tuple[str, str]:
    """Extract a direct audio stream URL for a YouTube video.

    Returns (audio_url, title).
    """
    cached = _read_cached_stream_url(video_id)
    if cached is not None:
        return cached

    if yt_dlp is None:
        raise StreamingError("yt-dlp is not installed. Cannot stream audio.")

    info = _extract_info(video_id, "bestaudio/best", "audio")

    audio_url = info.get("url")
    if not audio_url:
        # Try to find best audio format
        formats = info.get("formats", [])
        audio_formats = [
            f for f in formats
            if f.get("acodec", "none") != "none" and f.get("vcodec", "none") == "none"
        ]
        if audio_formats:
            # Pick highest quality audio-only format
            audio_formats.sort(key=lambda f: f.get("abr", 0) or 0, reverse=True)
            audio_url = audio_formats[0].get("url")

        if not audio_url:
            # Fall back to any format with audio
            for fmt in formats:
                if fmt.get("url") and fmt.get("acodec", "none") != "none":
                    audio_url = fmt["url"]
                    break

    if not audio_url:
        raise StreamingError("Could not find a streamable audio URL for this video.")

    title = _decode_text(info.get("title"), video_id)
    _cache_stream_url(video_id, audio_url, title, info.get("duration"))

    return audio_url, title


def get_video_stream_url(video_id: str) -> tuple[str, str]:
    """Extract a direct video stream URL that a browser `<video>` tag can play.

    Only progressive (already muxed) formats work here, because a plain `<video>`
    element cannot combine YouTube's separate video-only and audio-only streams.

    Returns (video_url, title).
    """
    cache_key = f"video:{video_id}"
    cached = _read_cached_stream_url(cache_key)
    if cached is not None:
        return cached

    if yt_dlp is None:
        raise StreamingError("yt-dlp is not installed. Cannot stream video.")

    info = _extract_info(video_id, MUXED_FORMAT_SELECTOR, "video")

    video_url = info.get("url")
    if not video_url:
        muxed_formats = [
            fmt
            for fmt in info.get("formats", [])
            if fmt.get("url")
            and fmt.get("vcodec", "none") != "none"
            and fmt.get("acodec", "none") != "none"
        ]
        # Prefer the highest resolution among the playable muxed formats.
        muxed_formats.sort(key=lambda fmt: fmt.get("height") or 0, reverse=True)
        if muxed_formats:
            video_url = muxed_formats[0].get("url")

    if not video_url:
        raise StreamingError(
            "This video has no combined audio+video stream that the in-app player can use."
        )

    title = _decode_text(info.get("title"), video_id)
    _cache_stream_url(cache_key, video_url, title, info.get("duration"))

    return video_url, title
