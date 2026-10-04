"""Channel, playlist and watch-page data read through yt-dlp.

The YouTube Data API cannot tell videos, Shorts and live streams apart on a
channel, and it has no stream URLs, so everything a YouTube-style browsing UI needs
beyond search comes from yt-dlp here. Results are cached because every channel tab
and every watch page costs a round trip to YouTube.
"""

import html
import json
import re
import threading
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import get_settings
from app.models.browse import (
    CaptionTrack,
    ChannelInfo,
    ChannelPage,
    ChannelTab,
    Chapter,
    Comment,
    CommentsResponse,
    HeatmapPoint,
    PlaylistSummary,
    QualityOption,
    Storyboard,
    VideoDetails,
    YouTubePlaylistPage,
)
from app.models.youtube import LiveStatus, VideoSearchResult
from app.services.youtube import format_clock

try:
    import yt_dlp
    from yt_dlp.utils import DownloadError
except ImportError:  # pragma: no cover - depends on local environment
    yt_dlp = None
    DownloadError = Exception

CHANNEL_ID_PATTERN = re.compile(r"^UC[\w-]{22}$")
HANDLE_PATTERN = re.compile(r"^@[\w.\-]{1,100}$")
PLAYLIST_ID_PATTERN = re.compile(r"^[\w-]{10,64}$")
VIDEO_ID_PATTERN = re.compile(r"^[\w-]{11}$")

PAGE_SIZE = 30
LISTING_CACHE_TTL_SECONDS = 10 * 60
# Stream URLs expire after roughly six hours, so an hour leaves plenty of margin.
VIDEO_INFO_CACHE_TTL_SECONDS = 60 * 60
CHANNEL_TAB_PATHS: dict[str, str] = {
    "videos": "videos",
    "shorts": "shorts",
    "live": "streams",
    "playlists": "playlists",
}
# avc1 plays everywhere with hardware decoding; VP9 and AV1 are needed above 1080p.
VIDEO_CODEC_PREFERENCE = (("avc1", 0), ("vp09", 1), ("vp9", 1), ("av01", 2))


class BrowseError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


class _TtlCache:
    def __init__(self, ttl_seconds: int) -> None:
        self.ttl_seconds = ttl_seconds
        self._items: dict[Any, tuple[float, Any]] = {}
        self._lock = threading.RLock()
        self._key_locks: dict[Any, threading.Lock] = {}

    def get(self, key: Any) -> Any | None:
        with self._lock:
            entry = self._items.get(key)
            if entry and entry[0] > time.time():
                return entry[1]
            return None

    def set(self, key: Any, value: Any) -> None:
        with self._lock:
            now = time.time()
            self._items[key] = (now + self.ttl_seconds, value)
            for stale_key in [k for k, (expiry, _) in self._items.items() if expiry <= now]:
                self._items.pop(stale_key, None)

    def key_lock(self, key: Any) -> threading.Lock:
        """Serialise work per key so parallel requests share one extraction."""
        with self._lock:
            return self._key_locks.setdefault(key, threading.Lock())


_listing_cache = _TtlCache(LISTING_CACHE_TTL_SECONDS)
_video_info_cache = _TtlCache(VIDEO_INFO_CACHE_TTL_SECONDS)


def _decode_text(value: object, fallback: str = "") -> str:
    text = str(value if value is not None else fallback)
    return html.unescape(text)


def _as_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    return None


def _ydl_options(**extra: Any) -> dict[str, Any]:
    settings = get_settings()
    options: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
    }

    if settings.youtube_cookies_file:
        options["cookiefile"] = settings.youtube_cookies_file

    if settings.po_token_server_url:
        options["extractor_args"] = {
            "youtubepot-bgutilhttp": {"base_url": [settings.po_token_server_url]},
        }

    extractor_args = {**options.get("extractor_args", {}), **extra.pop("extractor_args", {})}
    options.update(extra)
    if extractor_args:
        options["extractor_args"] = extractor_args
    return options


def _extract(url: str, **extra: Any) -> dict[str, Any]:
    if yt_dlp is None:
        raise BrowseError("yt-dlp is not installed.", status_code=503)

    try:
        with yt_dlp.YoutubeDL(_ydl_options(**extra)) as ydl:
            info = ydl.extract_info(url, download=False)
    except DownloadError as exc:
        message = str(exc).removeprefix("ERROR: ")
        status_code = 404 if "does not exist" in message or "unavailable" in message else 502
        raise BrowseError(message, status_code=status_code) from exc

    if not isinstance(info, dict):
        raise BrowseError("YouTube returned no data for this page.")

    return info


def _timestamp_to_iso(value: object) -> str:
    if isinstance(value, (int, float)) and value > 0:
        return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()
    return ""


def _upload_date_to_iso(value: object) -> str:
    if isinstance(value, str) and len(value) == 8 and value.isdigit():
        return f"{value[:4]}-{value[4:6]}-{value[6:]}T00:00:00+00:00"
    return ""


def _live_status(value: object) -> LiveStatus:
    if value in ("is_live", "was_live", "is_upcoming"):
        return value  # type: ignore[return-value]
    return "none"


def _duration_label(duration: int | None, live_status: LiveStatus) -> str:
    if live_status == "is_live":
        return "LIVE"
    if live_status == "is_upcoming":
        return "UPCOMING"
    return format_clock(duration) if duration else ""


def _best_thumbnail(thumbnails: object, video_id: str | None = None) -> str | None:
    if isinstance(thumbnails, list):
        candidates = [
            thumb
            for thumb in thumbnails
            if isinstance(thumb, dict) and isinstance(thumb.get("url"), str)
        ]
        if candidates:
            candidates.sort(key=lambda thumb: (thumb.get("width") or 0) * (thumb.get("height") or 0))
            return str(candidates[-1]["url"])

    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else None


def _thumbnail_by_id(thumbnails: object, thumbnail_id: str) -> str | None:
    if isinstance(thumbnails, list):
        for thumb in thumbnails:
            if isinstance(thumb, dict) and thumb.get("id") == thumbnail_id and thumb.get("url"):
                return str(thumb["url"])
    return None


def _entry_to_video(
    entry: dict[str, Any],
    *,
    channel_id: str,
    channel_title: str,
    is_short: bool = False,
) -> VideoSearchResult | None:
    video_id = entry.get("id")
    if not isinstance(video_id, str) or not VIDEO_ID_PATTERN.match(video_id):
        return None

    duration = _as_int(entry.get("duration"))
    live_status = _live_status(entry.get("live_status"))
    url = entry.get("url")

    return VideoSearchResult(
        id=video_id,
        title=_decode_text(entry.get("title"), "Untitled video"),
        channel_title=_decode_text(entry.get("channel") or entry.get("uploader") or channel_title),
        channel_id=str(entry.get("channel_id") or channel_id),
        description=_decode_text(entry.get("description"), ""),
        thumbnail_url=_best_thumbnail(entry.get("thumbnails"), video_id),
        duration_iso="",
        duration_label=_duration_label(duration, live_status),
        duration_seconds=duration,
        published_at=_timestamp_to_iso(entry.get("timestamp")),
        video_url=f"https://www.youtube.com/watch?v={video_id}",
        view_count=_as_int(entry.get("view_count")),
        live_status=live_status,
        is_short=is_short or (isinstance(url, str) and "/shorts/" in url),
    )


def _page_range(page: int) -> str:
    start = (page - 1) * PAGE_SIZE + 1
    # One extra item tells us whether another page exists.
    return f"{start}-{start + PAGE_SIZE}"


def _normalize_channel_ref(channel_ref: str) -> str:
    ref = channel_ref.strip()
    if CHANNEL_ID_PATTERN.match(ref):
        return f"https://www.youtube.com/channel/{ref}"
    if not ref.startswith("@"):
        ref = f"@{ref}"
    if HANDLE_PATTERN.match(ref):
        return f"https://www.youtube.com/{ref}"
    raise BrowseError("That does not look like a YouTube channel id or @handle.", status_code=400)


def _channel_info_from(info: dict[str, Any], fallback_ref: str) -> ChannelInfo:
    channel_id = str(info.get("channel_id") or info.get("id") or fallback_ref)
    thumbnails = info.get("thumbnails")
    sized = [
        thumb
        for thumb in thumbnails or []
        if isinstance(thumb, dict) and thumb.get("url") and thumb.get("width") and thumb.get("height")
    ]
    # The "uncropped" originals can be several megabytes, so prefer a sized copy.
    square = sorted(
        (thumb for thumb in sized if thumb["width"] == thumb["height"]),
        key=lambda thumb: (thumb["width"] < 176, thumb["width"]),
    )
    wide = sorted(
        (thumb for thumb in sized if thumb["width"] > thumb["height"] * 3),
        key=lambda thumb: abs(thumb["width"] - 2120),
    )
    avatar = str(square[0]["url"]) if square else _thumbnail_by_id(thumbnails, "avatar_uncropped")
    banner = str(wide[0]["url"]) if wide else _thumbnail_by_id(thumbnails, "banner_uncropped")

    name = _decode_text(info.get("channel") or info.get("uploader"), "")
    if not name:
        # Tab titles look like "Channel Name - Videos".
        name = _decode_text(info.get("title"), fallback_ref).rsplit(" - ", 1)[0]

    return ChannelInfo(
        id=channel_id,
        name=name,
        handle=info.get("uploader_id") if str(info.get("uploader_id", "")).startswith("@") else None,
        description=_decode_text(info.get("description"), ""),
        avatar_url=avatar,
        banner_url=banner,
        subscriber_count=_as_int(info.get("channel_follower_count")),
        url=str(info.get("channel_url") or f"https://www.youtube.com/channel/{channel_id}"),
        is_verified=bool(info.get("channel_is_verified")),
    )


def _get_channel_header(channel_ref: str) -> ChannelInfo:
    cache_key = ("channel-header", channel_ref)
    cached = _listing_cache.get(cache_key)
    if cached is not None:
        return cached

    info = _extract(
        f"{_normalize_channel_ref(channel_ref)}/videos",
        extract_flat="in_playlist",
        playlist_items="1",
    )
    header = _channel_info_from(info, channel_ref)
    _listing_cache.set(cache_key, header)
    return header


def get_channel_page(channel_ref: str, tab: ChannelTab, page: int = 1) -> ChannelPage:
    cache_key = ("channel", channel_ref, tab, page)
    cached = _listing_cache.get(cache_key)
    if cached is not None:
        return cached

    url = f"{_normalize_channel_ref(channel_ref)}/{CHANNEL_TAB_PATHS[tab]}"
    try:
        info = _extract(url, extract_flat="in_playlist", playlist_items=_page_range(page))
    except BrowseError as exc:
        if "does not have a" not in str(exc):
            raise
        # Channels without Shorts, streams or public playlists simply lack the tab.
        result = ChannelPage(
            channel=_get_channel_header(channel_ref),
            tab=tab,
            tab_available=False,
            page=page,
            has_more=False,
        )
        _listing_cache.set(cache_key, result)
        return result

    channel = _channel_info_from(info, channel_ref)
    _listing_cache.set(("channel-header", channel_ref), channel)
    entries = [entry for entry in info.get("entries") or [] if isinstance(entry, dict)]
    has_more = len(entries) > PAGE_SIZE
    entries = entries[:PAGE_SIZE]

    result = ChannelPage(channel=channel, tab=tab, page=page, has_more=has_more)
    if tab == "playlists":
        result.playlists = [
            PlaylistSummary(
                id=str(entry["id"]),
                title=_decode_text(entry.get("title"), "Untitled playlist"),
                thumbnail_url=_best_thumbnail(entry.get("thumbnails")),
                video_count=_as_int(entry.get("playlist_count")),
                channel_title=channel.name,
            )
            for entry in entries
            if isinstance(entry.get("id"), str)
        ]
    else:
        result.videos = [
            video
            for entry in entries
            if (
                video := _entry_to_video(
                    entry,
                    channel_id=channel.id,
                    channel_title=channel.name,
                    is_short=tab == "shorts",
                )
            )
        ]
        if tab == "live":
            for video in result.videos:
                if video.live_status == "none":
                    video.live_status = "was_live"

    _listing_cache.set(cache_key, result)
    return result


def get_youtube_playlist_page(playlist_id: str, page: int = 1) -> YouTubePlaylistPage:
    if not PLAYLIST_ID_PATTERN.match(playlist_id):
        raise BrowseError("That does not look like a YouTube playlist id.", status_code=400)

    cache_key = ("playlist", playlist_id, page)
    cached = _listing_cache.get(cache_key)
    if cached is not None:
        return cached

    info = _extract(
        f"https://www.youtube.com/playlist?list={playlist_id}",
        extract_flat="in_playlist",
        playlist_items=_page_range(page),
        noplaylist=False,
    )
    entries = [entry for entry in info.get("entries") or [] if isinstance(entry, dict)]
    has_more = len(entries) > PAGE_SIZE
    channel_id = str(info.get("channel_id") or "")
    channel_title = _decode_text(info.get("channel") or info.get("uploader"), "")

    items = [
        video
        for entry in entries[:PAGE_SIZE]
        if (video := _entry_to_video(entry, channel_id=channel_id, channel_title=channel_title))
    ]
    result = YouTubePlaylistPage(
        id=playlist_id,
        title=_decode_text(info.get("title"), "YouTube playlist"),
        description=_decode_text(info.get("description"), ""),
        channel_title=channel_title or None,
        channel_id=channel_id or None,
        thumbnail_url=_best_thumbnail(info.get("thumbnails"))
        or (str(items[0].thumbnail_url) if items else None),
        video_count=_as_int(info.get("playlist_count")),
        view_count=_as_int(info.get("view_count")),
        page=page,
        has_more=has_more,
        items=items,
    )
    _listing_cache.set(cache_key, result)
    return result


def get_video_info(video_id: str) -> dict[str, Any]:
    """Full yt-dlp info (formats, chapters, captions) for one video, cached."""
    if not VIDEO_ID_PATTERN.match(video_id):
        raise BrowseError("That does not look like a YouTube video id.", status_code=400)

    cached = _video_info_cache.get(video_id)
    if cached is not None:
        return cached

    # The details request and both stream requests of the player arrive together,
    # so they wait for one extraction instead of running three.
    with _video_info_cache.key_lock(video_id):
        cached = _video_info_cache.get(video_id)
        if cached is not None:
            return cached

        settings = get_settings()
        info = _extract(
            f"https://www.youtube.com/watch?v={video_id}",
            format="bv*+ba/b",
            ignore_no_formats_error=True,
            ffmpeg_location=settings.ffmpeg_binary.strip() or "ffmpeg",
        )
        _video_info_cache.set(video_id, info)
        return info


def _direct_formats(info: dict[str, Any]) -> list[dict[str, Any]]:
    # Only plain HTTPS files work in a <video> element; HLS manifests carry no CORS
    # headers and DASH-only formats need a full MSE player.
    return [
        fmt
        for fmt in info.get("formats") or []
        if isinstance(fmt, dict) and fmt.get("url") and fmt.get("protocol") == "https"
    ]


def _fps_bucket(fmt: dict[str, Any]) -> int:
    fps = fmt.get("fps") or 30
    return 60 if fps > 32 else 30


def _quality_id(height: int, fps_bucket: int) -> str:
    return f"{height}p{fps_bucket}" if fps_bucket == 60 else f"{height}p"


def _video_only_formats(info: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        fmt
        for fmt in _direct_formats(info)
        if fmt.get("vcodec") not in (None, "none")
        and fmt.get("acodec") in (None, "none")
        and isinstance(fmt.get("height"), int)
    ]


def list_qualities(info: dict[str, Any]) -> list[QualityOption]:
    seen: dict[str, QualityOption] = {}
    for fmt in _video_only_formats(info):
        bucket = _fps_bucket(fmt)
        quality_id = _quality_id(fmt["height"], bucket)
        seen.setdefault(
            quality_id,
            QualityOption(id=quality_id, label=quality_id, height=fmt["height"], fps=bucket),
        )

    return sorted(seen.values(), key=lambda option: (option.height, option.fps), reverse=True)


def _codec_rank(fmt: dict[str, Any]) -> int:
    vcodec = str(fmt.get("vcodec") or "")
    for prefix, rank in VIDEO_CODEC_PREFERENCE:
        if vcodec.startswith(prefix):
            return rank
    return len(VIDEO_CODEC_PREFERENCE)


def pick_video_only_url(info: dict[str, Any], quality_id: str | None) -> str:
    formats = _video_only_formats(info)
    if not formats:
        raise BrowseError("This video has no separate video stream the player can use.", 404)

    options = list_qualities(info)
    target = next((option for option in options if option.id == quality_id), None)
    if target is None:
        # Default to the best rendition at or below 1080p, like YouTube's auto mode on desktop.
        target = next((option for option in options if option.height <= 1080), options[-1])

    matching = [
        fmt
        for fmt in formats
        if fmt["height"] == target.height and _fps_bucket(fmt) == target.fps
    ]
    matching.sort(key=lambda fmt: (_codec_rank(fmt), -(fmt.get("tbr") or 0)))
    return str(matching[0]["url"])


def pick_audio_only_url(info: dict[str, Any]) -> str:
    formats = [
        fmt
        for fmt in _direct_formats(info)
        if fmt.get("vcodec") in (None, "none") and fmt.get("acodec") not in (None, "none")
    ]
    # Dynamic-range-compressed copies sound flat; keep the regular mix.
    regular = [fmt for fmt in formats if "drc" not in str(fmt.get("format_id", ""))] or formats
    if not regular:
        raise BrowseError("This video has no audio stream the player can use.", 404)

    regular.sort(
        key=lambda fmt: (
            fmt.get("language_preference") or 0,  # dubbed tracks rank below the original
            fmt.get("ext") == "m4a",  # AAC plays in every browser, Opus not in older Safari
            fmt.get("abr") or 0,
        ),
        reverse=True,
    )
    return str(regular[0]["url"])


def pick_muxed_url(info: dict[str, Any]) -> str | None:
    muxed = [
        fmt
        for fmt in _direct_formats(info)
        if fmt.get("vcodec") not in (None, "none") and fmt.get("acodec") not in (None, "none")
    ]
    muxed.sort(key=lambda fmt: fmt.get("height") or 0, reverse=True)
    return str(muxed[0]["url"]) if muxed else None


def _pick_storyboard(info: dict[str, Any]) -> Storyboard | None:
    boards = [
        fmt
        for fmt in info.get("formats") or []
        if isinstance(fmt, dict)
        and fmt.get("format_note") == "storyboard"
        and fmt.get("fragments")
        and fmt.get("fps")
        and fmt.get("rows")
        and fmt.get("columns")
    ]
    if not boards:
        return None

    # 160px wide frames match the size YouTube shows above its seek bar.
    boards.sort(key=lambda fmt: abs((fmt.get("width") or 0) - 160))
    board = boards[0]
    urls = [str(fragment["url"]) for fragment in board["fragments"] if fragment.get("url")]
    if not urls:
        return None

    return Storyboard(
        urls=urls,
        width=int(board["width"]),
        height=int(board["height"]),
        rows=int(board["rows"]),
        columns=int(board["columns"]),
        interval_seconds=1 / float(board["fps"]),
    )


def _auto_caption_key(info: dict[str, Any]) -> str | None:
    automatic = info.get("automatic_captions") or {}
    original = [key for key in automatic if key.endswith("-orig")]
    if original:
        return original[0]
    language = info.get("language")
    return language if isinstance(language, str) and language in automatic else None


def list_captions(info: dict[str, Any]) -> list[CaptionTrack]:
    tracks: list[CaptionTrack] = []
    for lang, variants in (info.get("subtitles") or {}).items():
        if lang == "live_chat" or not variants:
            continue
        name = next((v.get("name") for v in variants if v.get("name")), lang)
        tracks.append(CaptionTrack(lang=lang, name=str(name), auto_generated=False))

    auto_key = _auto_caption_key(info)
    if auto_key:
        variants = info["automatic_captions"][auto_key]
        name = next((v.get("name") for v in variants if v.get("name")), auto_key)
        name = re.sub(r"\s*\(Original\)\s*$", "", str(name))
        tracks.append(
            CaptionTrack(lang=auto_key, name=f"{name} (auto-generated)", auto_generated=True)
        )

    return tracks


def _vtt_timestamp(seconds: float) -> str:
    milliseconds = int(round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def json3_to_vtt(payload: dict[str, Any]) -> str:
    """Convert YouTube's json3 captions to WebVTT without the karaoke tags of its VTT."""
    lines = ["WEBVTT", ""]
    for event in payload.get("events") or []:
        segments = event.get("segs")
        if not segments or "tStartMs" not in event:
            continue
        text = "".join(str(segment.get("utf8", "")) for segment in segments).strip()
        if not text:
            continue
        start = event["tStartMs"] / 1000
        end = start + (event.get("dDurationMs") or 2000) / 1000
        lines.append(f"{_vtt_timestamp(start)} --> {_vtt_timestamp(end)}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines)


def fetch_caption_vtt(video_id: str, lang: str, auto_generated: bool) -> str:
    info = get_video_info(video_id)
    source = info.get("automatic_captions" if auto_generated else "subtitles") or {}
    variants = source.get(lang)
    if not variants:
        raise BrowseError("Those captions are not available for this video.", status_code=404)

    by_ext = {variant.get("ext"): variant for variant in variants if variant.get("url")}
    variant = by_ext.get("json3") or by_ext.get("vtt")
    if variant is None:
        raise BrowseError("No supported caption format was offered.", status_code=404)

    timeout = get_settings().request_timeout_seconds
    try:
        response = httpx.get(str(variant["url"]), timeout=timeout)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise BrowseError(f"Could not load captions: {exc}") from exc

    if variant.get("ext") == "json3":
        try:
            return json3_to_vtt(response.json())
        except (ValueError, json.JSONDecodeError) as exc:
            raise BrowseError("YouTube returned unreadable captions.") from exc

    return response.text


def build_video_details(info: dict[str, Any], local_video_url: str | None) -> VideoDetails:
    video_id = str(info.get("id"))
    live_status = _live_status(info.get("live_status"))
    duration = _as_int(info.get("duration"))
    published_at = (
        _timestamp_to_iso(info.get("release_timestamp") if live_status != "none" else None)
        or _timestamp_to_iso(info.get("timestamp"))
        or _upload_date_to_iso(info.get("upload_date"))
    )
    categories = info.get("categories") or []

    return VideoDetails(
        id=video_id,
        title=_decode_text(info.get("title"), video_id),
        description=_decode_text(info.get("description"), ""),
        channel_id=str(info.get("channel_id") or ""),
        channel_title=_decode_text(info.get("channel") or info.get("uploader"), "Unknown channel"),
        channel_handle=info.get("uploader_id")
        if str(info.get("uploader_id", "")).startswith("@")
        else None,
        channel_subscriber_count=_as_int(info.get("channel_follower_count")),
        channel_is_verified=bool(info.get("channel_is_verified")),
        thumbnail_url=str(info.get("thumbnail") or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"),
        video_url=f"https://www.youtube.com/watch?v={video_id}",
        duration_seconds=duration,
        duration_label=_duration_label(duration, live_status),
        view_count=_as_int(info.get("view_count")),
        like_count=_as_int(info.get("like_count")),
        comment_count=_as_int(info.get("comment_count")),
        published_at=published_at,
        live_status=live_status,
        width=_as_int(info.get("width")),
        height=_as_int(info.get("height")),
        tags=[str(tag) for tag in info.get("tags") or []][:20],
        category=str(categories[0]) if categories else None,
        chapters=[
            Chapter(
                title=_decode_text(chapter.get("title"), ""),
                start_seconds=float(chapter.get("start_time") or 0),
                end_seconds=float(chapter.get("end_time") or 0),
            )
            for chapter in info.get("chapters") or []
            if isinstance(chapter, dict)
        ],
        heatmap=[
            HeatmapPoint(
                start_seconds=float(point.get("start_time") or 0),
                end_seconds=float(point.get("end_time") or 0),
                value=float(point.get("value") or 0),
            )
            for point in info.get("heatmap") or []
            if isinstance(point, dict)
        ],
        qualities=list_qualities(info),
        captions=list_captions(info),
        storyboard=_pick_storyboard(info),
        local_video_url=local_video_url,
        embeddable=info.get("playable_in_embed") is not False,
    )


def get_comments_with_ytdlp(video_id: str) -> CommentsResponse:
    """Fallback when there is no API key: read the top comments through yt-dlp."""
    info = _extract(
        f"https://www.youtube.com/watch?v={video_id}",
        getcomments=True,
        ignore_no_formats_error=True,
        extractor_args={"youtube": {"max_comments": ["20", "20", "0", "0"], "comment_sort": ["top"]}},
    )
    comments = [
        Comment(
            id=str(comment.get("id", "")),
            author=_decode_text(comment.get("author"), "Unknown"),
            author_thumbnail_url=comment.get("author_thumbnail"),
            author_channel_id=comment.get("author_id"),
            text=_decode_text(comment.get("text"), ""),
            like_count=_as_int(comment.get("like_count")) or 0,
            published_at=_timestamp_to_iso(comment.get("timestamp")),
            is_pinned=bool(comment.get("is_pinned")),
            is_uploader=bool(comment.get("author_is_uploader")),
        )
        for comment in info.get("comments") or []
        if isinstance(comment, dict) and comment.get("parent") == "root"
    ]
    return CommentsResponse(items=comments, total=_as_int(info.get("comment_count")))
