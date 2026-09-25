import asyncio
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import RedirectResponse

from app.services.streaming import (
    StreamingError,
    get_audio_stream_url,
    get_video_stream_url,
)
from app.services.downloads import get_download_manager
from app.services.youtube_browse import (
    BrowseError,
    get_video_info,
    pick_audio_only_url,
    pick_video_only_url,
)

router = APIRouter()


@router.get("/stream/{video_id}")
async def stream_audio(video_id: str) -> RedirectResponse:
    """Redirect to a direct audio stream URL for the given YouTube video.

    If the video has already been downloaded, serves the local MP3 file instead.
    Otherwise, extracts a direct audio URL via yt-dlp and redirects to it.
    """
    # First check if we already have a completed download for this video
    manager = get_download_manager()
    existing = manager.find_completed_job_for_video(video_id)
    if existing and existing.download_path:
        return RedirectResponse(
            url=existing.download_path,
            status_code=status.HTTP_302_FOUND,
        )

    # Extract a direct audio URL
    try:
        audio_url, _title = get_audio_stream_url(video_id)
    except StreamingError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return RedirectResponse(
        url=audio_url,
        status_code=status.HTTP_302_FOUND,
    )


@router.get("/stream/{video_id}/video")
async def stream_video(video_id: str) -> RedirectResponse:
    """Redirect to a playable video stream URL for the given YouTube video.

    A locally downloaded video file wins because it keeps the quality that was
    downloaded; otherwise yt-dlp resolves a progressive stream that the in-app
    player can play directly.
    """
    manager = get_download_manager()
    existing = manager.find_completed_job_for_video(video_id, media_kind="video")
    if existing and existing.download_path:
        return RedirectResponse(
            url=existing.download_path,
            status_code=status.HTTP_302_FOUND,
        )

    try:
        video_url, _title = get_video_stream_url(video_id)
    except StreamingError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return RedirectResponse(
        url=video_url,
        status_code=status.HTTP_302_FOUND,
    )


@router.get("/stream/{video_id}/split/video")
async def stream_video_only(
    video_id: str,
    quality: Annotated[str | None, Query(max_length=12)] = None,
) -> RedirectResponse:
    """Redirect to a video-only rendition for the in-app HD player.

    YouTube only serves HD as separate video and audio files, so the player
    plays this muted and keeps `/split/audio` in sync with it.
    """
    try:
        info = await asyncio.to_thread(get_video_info, video_id)
        url = pick_video_only_url(info, quality)
    except BrowseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return RedirectResponse(url=url, status_code=status.HTTP_302_FOUND)


@router.get("/stream/{video_id}/split/audio")
async def stream_audio_only(video_id: str) -> RedirectResponse:
    """Redirect to the audio track that pairs with `/split/video`.

    Unlike `/stream/{video_id}`, this never serves a downloaded MP3: re-encoded
    files carry encoder padding that would drift out of sync with the picture.
    """
    try:
        info = await asyncio.to_thread(get_video_info, video_id)
        url = pick_audio_only_url(info)
    except BrowseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return RedirectResponse(url=url, status_code=status.HTTP_302_FOUND)
