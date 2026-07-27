import asyncio
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response

from app.services.thumbnails import ThumbnailError, fetch_video_thumbnail

router = APIRouter()


def _content_disposition(file_name: str, fallback_name: str) -> str:
    """Build an attachment header that survives non-ASCII titles."""
    ascii_name = file_name.encode("ascii", "ignore").decode().replace('"', "")
    quoted_name = quote(file_name)

    return (
        f'attachment; filename="{ascii_name or fallback_name}"; '
        f"filename*=UTF-8''{quoted_name}"
    )


@router.get("/thumbnails/{video_id}")
async def download_video_thumbnail(
    video_id: str,
    title: Annotated[str, Query(max_length=200)] = "",
    thumbnail_url: Annotated[str | None, Query()] = None,
) -> Response:
    """Return a video's thumbnail image as a file attachment."""
    try:
        thumbnail = await asyncio.to_thread(
            fetch_video_thumbnail,
            video_id,
            thumbnail_url=thumbnail_url,
            title=title,
        )
    except ThumbnailError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return Response(
        content=thumbnail.content,
        media_type=thumbnail.media_type,
        headers={
            "Content-Disposition": _content_disposition(
                thumbnail.file_name, f"{video_id}-thumbnail.jpg"
            ),
            "Cache-Control": "public, max-age=3600",
        },
    )
