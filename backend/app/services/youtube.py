import html
import threading
import time
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import httpx

from app.core.config import get_settings
from app.models.browse import Comment, CommentsResponse
from app.models.youtube import ChannelSearchResult, LiveStatus, VideoSearchResult

DURATION_PATTERN = re.compile(
    r"^P(?:(?P<days>\d+)D)?(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?$"
)

THUMBNAIL_PRIORITY = ("maxres", "high", "medium", "default")
CHANNEL_CACHE_TTL_SECONDS = 6 * 3600
TRENDING_CACHE_TTL_SECONDS = 15 * 60
# The API accepts at most 50 ids per videos.list / channels.list call.
API_BATCH_SIZE = 50

SearchOrder = Literal["relevance", "date", "viewCount", "rating"]
SearchDuration = Literal["any", "short", "medium", "long"]
SearchUploadDate = Literal["any", "hour", "today", "week", "month", "year"]

UPLOAD_DATE_WINDOWS = {
    "hour": timedelta(hours=1),
    "today": timedelta(days=1),
    "week": timedelta(days=7),
    "month": timedelta(days=31),
    "year": timedelta(days=365),
}


class SearchPage:
    def __init__(
        self,
        items: list[VideoSearchResult],
        channels: list[ChannelSearchResult],
        next_page_token: str | None,
    ) -> None:
        self.items = items
        self.channels = channels
        self.next_page_token = next_page_token


_search_cache: dict[tuple, tuple[float, SearchPage]] = {}
_search_cache_lock = threading.RLock()
_channel_cache: dict[str, tuple[float, ChannelSearchResult]] = {}
_trending_cache: dict[str, tuple[float, list[VideoSearchResult]]] = {}
_cache_lock = threading.RLock()


class YouTubeConfigError(RuntimeError):
    """Raised when the YouTube API cannot be used because local config is missing."""


class YouTubeUpstreamError(RuntimeError):
    """Raised when YouTube returns an upstream error or malformed payload."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


class YouTubeCommentsDisabledError(YouTubeUpstreamError):
    """Raised when the uploader has turned comments off for a video."""


def _decode_text(value: object, fallback: str = "") -> str:
    text = str(value if value is not None else fallback)
    return html.unescape(text)


def _duration_seconds(duration_iso: str) -> int | None:
    match = DURATION_PATTERN.match(duration_iso)
    if not match:
        return None

    parts = {name: int(value or "0") for name, value in match.groupdict().items()}
    return (
        parts["days"] * 86400 + parts["hours"] * 3600 + parts["minutes"] * 60 + parts["seconds"]
    )


def format_clock(total_seconds: int) -> str:
    hours, remainder = divmod(max(0, total_seconds), 3600)
    minutes, seconds = divmod(remainder, 60)

    if hours > 0:
        return f"{hours}:{minutes:02d}:{seconds:02d}"

    return f"{minutes}:{seconds:02d}"


def _format_duration(duration_iso: str) -> str:
    total_seconds = _duration_seconds(duration_iso)
    if total_seconds is None:
        return "Unknown"

    return format_clock(total_seconds)


def _to_int(value: object) -> int | None:
    try:
        return int(str(value))
    except (TypeError, ValueError):
        return None


def _pick_thumbnail(snippet: dict[str, Any]) -> str:
    thumbnails = snippet.get("thumbnails", {})

    for key in THUMBNAIL_PRIORITY:
        candidate = thumbnails.get(key)
        if isinstance(candidate, dict) and candidate.get("url"):
            return str(candidate["url"])

    raise YouTubeUpstreamError("YouTube response did not include a thumbnail URL.")


def _pick_thumbnail_or_default(snippet: dict[str, Any], video_id: str) -> str:
    try:
        return _pick_thumbnail(snippet)
    except YouTubeUpstreamError:
        return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


def _live_status(snippet: dict[str, Any], live_details: object = None) -> LiveStatus:
    broadcast = snippet.get("liveBroadcastContent")
    if broadcast == "live":
        return "is_live"
    if broadcast == "upcoming":
        return "is_upcoming"
    if isinstance(live_details, dict) and live_details.get("actualEndTime"):
        return "was_live"
    return "none"


def _extract_google_error(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text or "Unknown error from YouTube."

    error = payload.get("error")
    if not isinstance(error, dict):
        return response.text or "Unknown error from YouTube."

    errors = error.get("errors")
    if isinstance(errors, list) and errors:
        first = errors[0]
        if isinstance(first, dict) and first.get("message"):
            return str(first["message"])

    if error.get("message"):
        return str(error["message"])

    return response.text or "Unknown error from YouTube."


async def _fetch_json(
    client: httpx.AsyncClient,
    *,
    url: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    response = await client.get(url, params=params)

    if response.status_code >= 400:
        detail = _extract_google_error(response)
        if "disabled comments" in detail:
            raise YouTubeCommentsDisabledError(detail, status_code=403)

        status_code = 503 if response.status_code in {401, 403, 429} else 502
        raise YouTubeUpstreamError(
            f"YouTube API request failed: {detail}",
            status_code=status_code,
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise YouTubeUpstreamError("YouTube API returned malformed JSON.") from exc

    if not isinstance(payload, dict):
        raise YouTubeUpstreamError("YouTube API returned an unexpected payload.")

    return payload


def has_api_key() -> bool:
    return bool(get_settings().youtube_api_key)


def _require_api_key() -> str:
    api_key = get_settings().youtube_api_key
    if not api_key:
        raise YouTubeConfigError(
            "YouTube search is not configured yet. Add `YOUTUBE_API_KEY` to `backend/.env`."
        )
    return api_key


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=httpx.Timeout(get_settings().request_timeout_seconds))


def _batches(items: list[str], size: int = API_BATCH_SIZE) -> list[list[str]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def _video_result_from_api_item(
    item: dict[str, Any],
    channel_thumbnails: dict[str, str | None] | None = None,
) -> VideoSearchResult | None:
    video_id = item.get("id")
    snippet = item.get("snippet")
    if not isinstance(video_id, str) or not isinstance(snippet, dict):
        return None

    content_details = item.get("contentDetails") or {}
    statistics = item.get("statistics") or {}
    duration_iso = str(content_details.get("duration") or "PT0S")
    channel_id = str(snippet.get("channelId", ""))
    live_status = _live_status(snippet, item.get("liveStreamingDetails"))

    return VideoSearchResult(
        id=video_id,
        title=_decode_text(snippet.get("title"), "Untitled video"),
        channel_title=_decode_text(snippet.get("channelTitle"), "Unknown channel"),
        channel_id=channel_id,
        description=_decode_text(snippet.get("description"), ""),
        thumbnail_url=_pick_thumbnail_or_default(snippet, video_id),
        duration_iso=duration_iso,
        duration_label="LIVE" if live_status == "is_live" else _format_duration(duration_iso),
        duration_seconds=_duration_seconds(duration_iso),
        published_at=str(snippet.get("publishedAt", "")),
        video_url=f"https://www.youtube.com/watch?v={video_id}",
        view_count=_to_int(statistics.get("viewCount")),
        channel_thumbnail_url=(channel_thumbnails or {}).get(channel_id),
        live_status=live_status,
    )


async def _fetch_video_items(
    client: httpx.AsyncClient, video_ids: list[str]
) -> dict[str, dict[str, Any]]:
    """Look up full video resources (snippet, duration, stats) keyed by id."""
    settings = get_settings()
    found: dict[str, dict[str, Any]] = {}

    for batch in _batches(video_ids):
        payload = await _fetch_json(
            client,
            url=f"{settings.youtube_api_base_url}/videos",
            params={
                "key": settings.youtube_api_key,
                "part": "snippet,contentDetails,statistics,liveStreamingDetails",
                "id": ",".join(batch),
                "maxResults": API_BATCH_SIZE,
            },
        )
        for item in payload.get("items", []):
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                found[item["id"]] = item

    return found


def _channel_from_api_item(item: dict[str, Any]) -> ChannelSearchResult:
    snippet = item.get("snippet") or {}
    statistics = item.get("statistics") or {}
    thumbnails = snippet.get("thumbnails") or {}
    thumbnail = None
    for key in ("medium", "high", "default"):
        candidate = thumbnails.get(key)
        if isinstance(candidate, dict) and candidate.get("url"):
            thumbnail = str(candidate["url"])
            break

    return ChannelSearchResult(
        id=str(item["id"]),
        title=_decode_text(snippet.get("title"), "Unknown channel"),
        description=_decode_text(snippet.get("description"), ""),
        thumbnail_url=thumbnail,
        handle=snippet.get("customUrl") or None,
        subscriber_count=(
            None
            if statistics.get("hiddenSubscriberCount")
            else _to_int(statistics.get("subscriberCount"))
        ),
        video_count=_to_int(statistics.get("videoCount")),
    )


async def fetch_channels(channel_ids: list[str]) -> dict[str, ChannelSearchResult]:
    """Return channel avatars and subscriber counts, cached for a few hours."""
    if not channel_ids or not has_api_key():
        return {}

    settings = get_settings()
    now = time.time()
    result: dict[str, ChannelSearchResult] = {}
    missing: list[str] = []

    with _cache_lock:
        for channel_id in dict.fromkeys(channel_ids):
            cached = _channel_cache.get(channel_id)
            if cached and cached[0] > now:
                result[channel_id] = cached[1]
            elif channel_id:
                missing.append(channel_id)

    if not missing:
        return result

    async with _client() as client:
        for batch in _batches(missing):
            payload = await _fetch_json(
                client,
                url=f"{settings.youtube_api_base_url}/channels",
                params={
                    "key": settings.youtube_api_key,
                    "part": "snippet,statistics",
                    "id": ",".join(batch),
                    "maxResults": API_BATCH_SIZE,
                },
            )
            for item in payload.get("items", []):
                if isinstance(item, dict) and isinstance(item.get("id"), str):
                    channel = _channel_from_api_item(item)
                    result[channel.id] = channel

    with _cache_lock:
        expires_at = time.time() + CHANNEL_CACHE_TTL_SECONDS
        for channel_id in missing:
            if channel_id in result:
                _channel_cache[channel_id] = (expires_at, result[channel_id])

    return result


async def safe_fetch_channels(channel_ids: list[str]) -> dict[str, ChannelSearchResult]:
    """Channel avatars are decoration, so a failed lookup must not fail the page."""
    try:
        return await fetch_channels(channel_ids)
    except (YouTubeUpstreamError, httpx.HTTPError):
        return {}


async def search_youtube(
    query: str,
    max_results: int,
    *,
    page_token: str | None = None,
    order: SearchOrder = "relevance",
    duration: SearchDuration = "any",
    upload_date: SearchUploadDate = "any",
) -> SearchPage:
    settings = get_settings()
    api_key = _require_api_key()

    normalized_limit = min(max_results, 24)
    cache_key = (
        query.strip().lower(),
        normalized_limit,
        page_token or "",
        order,
        duration,
        upload_date,
    )
    now = time.time()

    with _search_cache_lock:
        cached_entry = _search_cache.get(cache_key)
        if cached_entry and cached_entry[0] > now:
            return cached_entry[1]

    has_filters = duration != "any" or upload_date != "any" or order != "relevance"
    # Channel matches only make sense at the top of an unfiltered first page, like
    # YouTube shows them; filters such as videoDuration also require type=video.
    include_channels = not page_token and not has_filters

    params: dict[str, Any] = {
        "key": api_key,
        "part": "snippet",
        "type": "video,channel" if include_channels else "video",
        "maxResults": normalized_limit,
        "q": query,
        "order": order,
    }
    if page_token:
        params["pageToken"] = page_token
    if duration != "any":
        params["videoDuration"] = duration
    if upload_date in UPLOAD_DATE_WINDOWS:
        published_after = datetime.now(timezone.utc) - UPLOAD_DATE_WINDOWS[upload_date]
        params["publishedAfter"] = published_after.strftime("%Y-%m-%dT%H:%M:%SZ")

    async with _client() as client:
        search_payload = await _fetch_json(
            client,
            url=f"{settings.youtube_api_base_url}/search",
            params=params,
        )

        video_ids: list[str] = []
        channel_ids: list[str] = []
        for item in search_payload.get("items", []):
            if not isinstance(item, dict) or not isinstance(item.get("id"), dict):
                continue
            identifier = item["id"]
            if isinstance(identifier.get("videoId"), str):
                video_ids.append(identifier["videoId"])
            elif isinstance(identifier.get("channelId"), str):
                channel_ids.append(identifier["channelId"])

        video_items = await _fetch_video_items(client, video_ids) if video_ids else {}

    uploader_ids = [
        str((video_items[video_id].get("snippet") or {}).get("channelId", ""))
        for video_id in video_ids
        if video_id in video_items
    ]
    channel_lookup = await safe_fetch_channels(channel_ids + uploader_ids)
    thumbnails = {key: value.thumbnail_url for key, value in channel_lookup.items()}

    results: list[VideoSearchResult] = []
    for video_id in video_ids:
        item = video_items.get(video_id)
        result = _video_result_from_api_item(item, thumbnails) if item else None
        if result is not None:
            results.append(result)

    channels = [
        channel_lookup[channel_id] for channel_id in channel_ids if channel_id in channel_lookup
    ]
    next_page_token = search_payload.get("nextPageToken")
    page = SearchPage(
        results,
        channels,
        next_page_token if isinstance(next_page_token, str) else None,
    )

    expires_at = now + max(0, settings.youtube_search_cache_ttl_seconds)
    with _search_cache_lock:
        _search_cache[cache_key] = (expires_at, page)
        current_time = time.time()
        expired_keys = [
            key for key, (expiry, _) in _search_cache.items() if expiry <= current_time
        ]
        for key in expired_keys:
            _search_cache.pop(key, None)

    return page


async def search_youtube_videos(query: str, max_results: int) -> list[VideoSearchResult]:
    page = await search_youtube(query, max_results)
    return list(page.items)


async def fetch_video_results(video_ids: list[str]) -> dict[str, VideoSearchResult]:
    """Full metadata for known ids, used to add upload dates to yt-dlp listings."""
    if not video_ids or not has_api_key():
        return {}

    async with _client() as client:
        video_items = await _fetch_video_items(client, video_ids)

    results: dict[str, VideoSearchResult] = {}
    for video_id, item in video_items.items():
        result = _video_result_from_api_item(item)
        if result is not None:
            results[video_id] = result
    return results


async def get_trending_videos(region_code: str = "US") -> list[VideoSearchResult]:
    settings = get_settings()
    api_key = _require_api_key()
    region = region_code.upper()
    now = time.time()

    with _cache_lock:
        cached = _trending_cache.get(region)
        if cached and cached[0] > now:
            return list(cached[1])

    async with _client() as client:
        payload = await _fetch_json(
            client,
            url=f"{settings.youtube_api_base_url}/videos",
            params={
                "key": api_key,
                "part": "snippet,contentDetails,statistics,liveStreamingDetails",
                "chart": "mostPopular",
                "regionCode": region,
                "maxResults": 24,
            },
        )

    items = [item for item in payload.get("items", []) if isinstance(item, dict)]
    channel_ids = [str((item.get("snippet") or {}).get("channelId", "")) for item in items]
    channels = await safe_fetch_channels(channel_ids)
    thumbnails = {key: value.thumbnail_url for key, value in channels.items()}

    results: list[VideoSearchResult] = []
    for item in items:
        result = _video_result_from_api_item(item, thumbnails)
        if result is not None:
            results.append(result)

    with _cache_lock:
        _trending_cache[region] = (time.time() + TRENDING_CACHE_TTL_SECONDS, results)

    return list(results)


async def get_video_comments(
    video_id: str,
    *,
    page_token: str | None = None,
    order: Literal["relevance", "time"] = "relevance",
    uploader_channel_id: str | None = None,
) -> CommentsResponse:
    settings = get_settings()
    api_key = _require_api_key()
    params: dict[str, Any] = {
        "key": api_key,
        "part": "snippet",
        "videoId": video_id,
        "maxResults": 20,
        "order": order,
        "textFormat": "plainText",
    }
    if page_token:
        params["pageToken"] = page_token

    try:
        async with _client() as client:
            payload = await _fetch_json(
                client,
                url=f"{settings.youtube_api_base_url}/commentThreads",
                params=params,
            )
    except YouTubeCommentsDisabledError:
        return CommentsResponse(items=[], disabled=True)

    comments: list[Comment] = []
    for thread in payload.get("items", []):
        if not isinstance(thread, dict):
            continue
        thread_snippet = thread.get("snippet") or {}
        top = (thread_snippet.get("topLevelComment") or {}).get("snippet") or {}
        author_channel = (top.get("authorChannelId") or {}).get("value")
        comments.append(
            Comment(
                id=str(thread.get("id", "")),
                author=_decode_text(top.get("authorDisplayName"), "Unknown"),
                author_thumbnail_url=top.get("authorProfileImageUrl"),
                author_channel_id=author_channel,
                text=_decode_text(top.get("textDisplay") or top.get("textOriginal"), ""),
                like_count=_to_int(top.get("likeCount")) or 0,
                published_at=str(top.get("publishedAt", "")),
                reply_count=_to_int(thread_snippet.get("totalReplyCount")) or 0,
                is_uploader=bool(uploader_channel_id and author_channel == uploader_channel_id),
            )
        )

    next_page_token = payload.get("nextPageToken")
    total = (payload.get("pageInfo") or {}).get("totalResults")
    return CommentsResponse(
        items=comments,
        next_page_token=next_page_token if isinstance(next_page_token, str) else None,
        total=_to_int(total),
    )
