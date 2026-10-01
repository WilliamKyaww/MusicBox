import asyncio
import mimetypes
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.models.downloads import (
    DownloadJob,
    DownloadListResponse,
    DownloadRequest,
    DownloadSection,
    EnqueueDownloadResponse,
    MediaKind,
    RemoveDownloadResponse,
    UpdateDownloadRequest,
    VideoQuality,
)
from app.services.downloads import (
    DownloadRuntimeError,
    get_download_manager,
    media_type_for_file,
)

router = APIRouter()


@router.get("/downloads", response_model=DownloadListResponse)
async def list_downloads() -> DownloadListResponse:
    manager = get_download_manager()
    return DownloadListResponse(runtime=manager.get_runtime_status(), items=manager.list_jobs())


@router.post(
    "/downloads",
    response_model=EnqueueDownloadResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_download(request: DownloadRequest) -> EnqueueDownloadResponse:
    manager = get_download_manager()

    try:
        job, deduplicated = manager.enqueue_download(request)
    except DownloadRuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return EnqueueDownloadResponse(job=job, deduplicated=deduplicated)


@router.get("/downloads/direct")
async def download_direct(
    video_id: Annotated[str, Query(min_length=5, max_length=64)],
    title: Annotated[str, Query(max_length=200)] = "",
    channel_title: Annotated[str, Query(max_length=200)] = "",
    source_url: Annotated[str | None, Query()] = None,
    media_kind: Annotated[MediaKind, Query()] = "audio",
    video_quality: Annotated[VideoQuality, Query()] = "best",
    start_seconds: Annotated[int, Query(ge=0)] = 0,
    end_seconds: Annotated[int | None, Query(gt=0)] = None,
) -> FileResponse:
    """Download a video (or just its audio) straight to the caller's device.

    Nothing is kept in the saved-songs library: the media is built in a scratch
    folder, streamed back as an attachment, then deleted.
    """
    manager = get_download_manager()

    if end_seconds is not None and end_seconds <= start_seconds:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The section end must be after the section start.",
        )

    try:
        request = DownloadRequest(
            video_id=video_id,
            title=title or video_id,
            channel_title=channel_title,
            source_url=source_url or None,
            media_kind=media_kind,
            video_quality=video_quality,
            section=DownloadSection(
                start_seconds=start_seconds,
                end_seconds=end_seconds,
            ),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    try:
        direct_download = await asyncio.to_thread(
            manager.prepare_direct_download, request
        )
    except DownloadRuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:  # pragma: no cover - depends on local tools/network
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"The direct download failed: {exc}",
        ) from exc

    return FileResponse(
        path=direct_download.file_path,
        media_type=direct_download.media_type,
        filename=direct_download.file_name,
        background=BackgroundTask(
            manager.cleanup_direct_download, direct_download.cleanup_dir
        ),
    )


@router.patch("/downloads/{job_id}", response_model=DownloadJob)
async def update_download(job_id: str, request: UpdateDownloadRequest) -> DownloadJob:
    manager = get_download_manager()

    try:
        return manager.update_job(job_id, request)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Download not found.") from exc
    except DownloadRuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post(
    "/downloads/{job_id}/redownload",
    response_model=EnqueueDownloadResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def redownload_download(job_id: str) -> EnqueueDownloadResponse:
    manager = get_download_manager()

    try:
        job, deduplicated = manager.redownload_job(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Download not found.") from exc
    except DownloadRuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return EnqueueDownloadResponse(job=job, deduplicated=deduplicated)


@router.post("/downloads/{job_id}/cancel", response_model=RemoveDownloadResponse)
async def cancel_download(job_id: str) -> RemoveDownloadResponse:
    """Stop a queued or running download; it is removed along with any partial files."""
    manager = get_download_manager()

    try:
        cancelled_job_id = manager.cancel_job(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Download not found.") from exc
    except DownloadRuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return RemoveDownloadResponse(removed_job_id=cancelled_job_id, deleted_file=True)


@router.delete("/downloads/{job_id}", response_model=RemoveDownloadResponse)
async def remove_download(job_id: str, delete_file: bool = True) -> RemoveDownloadResponse:
    manager = get_download_manager()

    try:
        removed_job_id, deleted_file = manager.remove_job(job_id, delete_file=delete_file)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Download not found.") from exc
    except DownloadRuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return RemoveDownloadResponse(
        removed_job_id=removed_job_id,
        deleted_file=deleted_file,
    )


@router.get("/downloads/{job_id}", response_model=DownloadJob)
async def get_download(job_id: str) -> DownloadJob:
    manager = get_download_manager()

    try:
        return manager.get_job(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Download not found.") from exc


@router.get("/downloads/{job_id}/file")
async def get_download_file(job_id: str) -> FileResponse:
    manager = get_download_manager()

    try:
        file_path = manager.get_file_path(job_id)
        job = manager.get_job(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Download not found.") from exc
    except DownloadRuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The completed media file could not be found on disk.",
        )

    return FileResponse(
        path=file_path,
        media_type=media_type_for_file(file_path),
        filename=job.file_name or file_path.name,
    )


@router.get("/downloads/{job_id}/thumbnail")
async def get_download_thumbnail(job_id: str) -> FileResponse:
    manager = get_download_manager()

    try:
        file_path = manager.get_thumbnail_path(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Download not found.") from exc
    except DownloadRuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    media_type = mimetypes.guess_type(file_path.name)[0] or "image/jpeg"
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=file_path.name,
    )
