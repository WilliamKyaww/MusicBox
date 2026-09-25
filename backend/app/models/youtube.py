from typing import Literal

from pydantic import BaseModel, HttpUrl

LiveStatus = Literal["none", "is_live", "was_live", "is_upcoming"]


class VideoSearchResult(BaseModel):
    id: str
    title: str
    channel_title: str
    channel_id: str
    description: str
    thumbnail_url: HttpUrl
    duration_iso: str
    duration_label: str
    published_at: str
    video_url: HttpUrl
    duration_seconds: int | None = None
    view_count: int | None = None
    channel_thumbnail_url: str | None = None
    live_status: LiveStatus = "none"
    is_short: bool = False


class ChannelSearchResult(BaseModel):
    id: str
    title: str
    description: str
    thumbnail_url: str | None = None
    handle: str | None = None
    subscriber_count: int | None = None
    video_count: int | None = None


class SearchResponse(BaseModel):
    query: str
    total: int
    items: list[VideoSearchResult]
    channels: list[ChannelSearchResult] = []
    next_page_token: str | None = None


class FeedResponse(BaseModel):
    items: list[VideoSearchResult]
    available: bool = True
    message: str | None = None
