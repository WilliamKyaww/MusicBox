from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.models.youtube import SearchResponse
from app.services.youtube import (
    SearchDuration,
    SearchOrder,
    SearchUploadDate,
    YouTubeConfigError,
    YouTubeUpstreamError,
    search_youtube,
)

router = APIRouter()


@router.get("/search", response_model=SearchResponse)
async def search_videos(
    q: Annotated[
        str,
        Query(
            min_length=2,
            max_length=120,
            description="Free-text search query for YouTube videos.",
        ),
    ],
    max_results: Annotated[
        int,
        Query(ge=1, le=24, description="Maximum number of videos to return."),
    ] = 12,
    page_token: Annotated[str | None, Query(max_length=200)] = None,
    order: SearchOrder = "relevance",
    duration: SearchDuration = "any",
    upload_date: SearchUploadDate = "any",
) -> SearchResponse:
    try:
        page = await search_youtube(
            q,
            max_results,
            page_token=page_token,
            order=order,
            duration=duration,
            upload_date=upload_date,
        )
    except YouTubeConfigError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except YouTubeUpstreamError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return SearchResponse(
        query=q,
        total=len(page.items),
        items=page.items,
        channels=page.channels,
        next_page_token=page.next_page_token,
    )
