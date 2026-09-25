import asyncio
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import PlainTextResponse

from app.models.browse import ChannelPage, ChannelTab, CommentsResponse, VideoDetails, YouTubePlaylistPage
from app.models.youtube import FeedResponse, VideoSearchResult
from app.services.downloads import get_download_manager
from app.services.youtube import (
    YouTubeConfigError,
    YouTubeUpstreamError,
    fetch_video_results,
    get_trending_videos,
    get_video_comments,
    has_api_key,
    safe_fetch_channels,
)
from app.services.youtube_browse import (
    BrowseError,
    build_video_details,
    fetch_caption_vtt,
    get_channel_page,
    get_comments_with_ytdlp,
    get_video_info,
    get_youtube_playlist_page,
)

router = APIRouter()

MAX_FEED_CHANNELS = 30
FEED_VIDEOS_PER_CHANNEL = 10
FEED_CONCURRENCY = 4


def _raise_http(exc: BrowseError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


async def _enrich_videos(videos: list[VideoSearchResult], channel_avatar: str | None = None) -> None:
    """Fill in upload dates (and anything else yt-dlp's flat listings lack).

    Listings are cached, so the enriched objects are kept and later requests skip
    the API call entirely.
    """
    for video in videos:
        if channel_avatar and not video.channel_thumbnail_url:
            video.channel_thumbnail_url = channel_avatar

    missing = [video.id for video in videos if not video.published_at]
    if not missing:
        return

    try:
        metadata = await fetch_video_results(missing)
    except (YouTubeUpstreamError, YouTubeConfigError, httpx.HTTPError):
        return

    for video in videos:
        extra = metadata.get(video.id)
        if extra is None:
            continue
        video.published_at = extra.published_at
        if video.view_count is None:
            video.view_count = extra.view_count
        if video.duration_seconds is None and extra.duration_seconds:
            video.duration_seconds = extra.duration_seconds
            video.duration_label = extra.duration_label
        if extra.live_status != "none":
            video.live_status = extra.live_status
            if extra.live_status == "is_live":
                video.duration_label = "LIVE"
        if not video.description:
            video.description = extra.description
        if video.title == "Untitled video":
            video.title = extra.title


@router.get("/channels/{channel_ref}", response_model=ChannelPage)
async def channel_page(
    channel_ref: str,
    tab: Annotated[ChannelTab, Query()] = "videos",
    page: Annotated[int, Query(ge=1, le=50)] = 1,
) -> ChannelPage:
    try:
        result = await asyncio.to_thread(get_channel_page, channel_ref, tab, page)
    except BrowseError as exc:
        _raise_http(exc)

    if not result.channel.avatar_url and has_api_key():
        channels = await safe_fetch_channels([result.channel.id])
        if result.channel.id in channels:
            result.channel.avatar_url = channels[result.channel.id].thumbnail_url

    await _enrich_videos(result.videos, result.channel.avatar_url)
    return result


@router.get("/youtube-playlists/{playlist_id}", response_model=YouTubePlaylistPage)
async def youtube_playlist_page(
    playlist_id: str,
    page: Annotated[int, Query(ge=1, le=100)] = 1,
) -> YouTubePlaylistPage:
    try:
        result = await asyncio.to_thread(get_youtube_playlist_page, playlist_id, page)
    except BrowseError as exc:
        _raise_http(exc)

    await _enrich_videos(result.items)
    if has_api_key():
        # Private and deleted entries have no title in the listing and are not
        # returned by the API, so they are the ones still missing a date.
        result.items = [
            video
            for video in result.items
            if video.published_at or video.title != "Untitled video"
        ]
    return result


@router.get("/videos/{video_id}", response_model=VideoDetails)
async def video_details(video_id: str) -> VideoDetails:
    try:
        info = await asyncio.to_thread(get_video_info, video_id)
    except BrowseError as exc:
        _raise_http(exc)

    local_job = get_download_manager().find_completed_job_for_video(video_id, media_kind="video")
    details = build_video_details(info, local_job.download_path if local_job else None)

    if details.channel_id:
        channels = await safe_fetch_channels([details.channel_id])
        channel = channels.get(details.channel_id)
        if channel is not None:
            details.channel_thumbnail_url = channel.thumbnail_url
            if details.channel_subscriber_count is None:
                details.channel_subscriber_count = channel.subscriber_count

    return details


@router.get("/videos/{video_id}/captions")
async def video_captions(
    video_id: str,
    lang: Annotated[str, Query(min_length=1, max_length=40)],
    auto: bool = False,
) -> PlainTextResponse:
    try:
        vtt = await asyncio.to_thread(fetch_caption_vtt, video_id, lang, auto)
    except BrowseError as exc:
        _raise_http(exc)

    return PlainTextResponse(
        vtt,
        media_type="text/vtt",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/videos/{video_id}/comments", response_model=CommentsResponse)
async def video_comments(
    video_id: str,
    page_token: Annotated[str | None, Query(max_length=400)] = None,
    order: Literal["relevance", "time"] = "relevance",
    channel_id: Annotated[str | None, Query(max_length=64)] = None,
) -> CommentsResponse:
    if has_api_key():
        try:
            return await get_video_comments(
                video_id,
                page_token=page_token,
                order=order,
                uploader_channel_id=channel_id,
            )
        except YouTubeUpstreamError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    if page_token:
        return CommentsResponse(items=[])

    try:
        return await asyncio.to_thread(get_comments_with_ytdlp, video_id)
    except BrowseError as exc:
        _raise_http(exc)


@router.get("/feed/trending", response_model=FeedResponse)
async def trending_feed(
    region: Annotated[str, Query(min_length=2, max_length=2)] = "US",
) -> FeedResponse:
    try:
        items = await get_trending_videos(region)
    except YouTubeConfigError as exc:
        return FeedResponse(items=[], available=False, message=str(exc))
    except YouTubeUpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return FeedResponse(items=items)


@router.get("/feed/subscriptions", response_model=FeedResponse)
async def subscriptions_feed(
    channel_ids: Annotated[str, Query(max_length=4000)] = "",
) -> FeedResponse:
    refs = [ref.strip() for ref in channel_ids.split(",") if ref.strip()][:MAX_FEED_CHANNELS]
    if not refs:
        return FeedResponse(items=[])

    semaphore = asyncio.Semaphore(FEED_CONCURRENCY)

    async def load(ref: str) -> list[VideoSearchResult]:
        async with semaphore:
            try:
                page = await asyncio.to_thread(get_channel_page, ref, "videos", 1)
            except BrowseError:
                return []
        for video in page.videos:
            if page.channel.avatar_url and not video.channel_thumbnail_url:
                video.channel_thumbnail_url = page.channel.avatar_url
        return page.videos[:FEED_VIDEOS_PER_CHANNEL]

    per_channel = await asyncio.gather(*(load(ref) for ref in refs))
    videos = [video for channel_videos in per_channel for video in channel_videos]
    await _enrich_videos(videos)

    # Without upload dates, interleave channels so one busy channel cannot fill the feed.
    rank = {
        video.id: index
        for channel_videos in per_channel
        for index, video in enumerate(channel_videos)
    }
    videos.sort(key=lambda video: (video.published_at or "", -rank.get(video.id, 0)), reverse=True)
    return FeedResponse(items=videos)
