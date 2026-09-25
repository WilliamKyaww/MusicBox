from typing import Literal

from pydantic import BaseModel

from app.models.youtube import LiveStatus, VideoSearchResult

ChannelTab = Literal["videos", "shorts", "live", "playlists"]


class ChannelInfo(BaseModel):
    id: str
    name: str
    handle: str | None = None
    description: str = ""
    avatar_url: str | None = None
    banner_url: str | None = None
    subscriber_count: int | None = None
    url: str
    is_verified: bool = False


class PlaylistSummary(BaseModel):
    id: str
    title: str
    thumbnail_url: str | None = None
    video_count: int | None = None
    channel_title: str | None = None


class ChannelPage(BaseModel):
    channel: ChannelInfo
    tab: ChannelTab
    tab_available: bool = True
    page: int
    has_more: bool
    videos: list[VideoSearchResult] = []
    playlists: list[PlaylistSummary] = []


class YouTubePlaylistPage(BaseModel):
    id: str
    title: str
    description: str = ""
    channel_title: str | None = None
    channel_id: str | None = None
    thumbnail_url: str | None = None
    video_count: int | None = None
    view_count: int | None = None
    page: int
    has_more: bool
    items: list[VideoSearchResult]


class Chapter(BaseModel):
    title: str
    start_seconds: float
    end_seconds: float


class HeatmapPoint(BaseModel):
    start_seconds: float
    end_seconds: float
    value: float


class QualityOption(BaseModel):
    """A video-only rendition the in-app player can switch to."""

    id: str
    label: str
    height: int
    fps: int


class CaptionTrack(BaseModel):
    lang: str
    name: str
    auto_generated: bool


class Storyboard(BaseModel):
    """Sprite sheets used for the seek-bar hover preview."""

    urls: list[str]
    width: int
    height: int
    rows: int
    columns: int
    interval_seconds: float


class VideoDetails(BaseModel):
    id: str
    title: str
    description: str
    channel_id: str
    channel_title: str
    channel_handle: str | None = None
    channel_thumbnail_url: str | None = None
    channel_subscriber_count: int | None = None
    channel_is_verified: bool = False
    thumbnail_url: str
    video_url: str
    duration_seconds: int | None = None
    duration_label: str
    view_count: int | None = None
    like_count: int | None = None
    comment_count: int | None = None
    published_at: str
    live_status: LiveStatus = "none"
    width: int | None = None
    height: int | None = None
    tags: list[str] = []
    category: str | None = None
    chapters: list[Chapter] = []
    heatmap: list[HeatmapPoint] = []
    qualities: list[QualityOption] = []
    captions: list[CaptionTrack] = []
    storyboard: Storyboard | None = None
    local_video_url: str | None = None
    embeddable: bool = True


class Comment(BaseModel):
    id: str
    author: str
    author_thumbnail_url: str | None = None
    author_channel_id: str | None = None
    text: str
    like_count: int = 0
    published_at: str = ""
    reply_count: int = 0
    is_pinned: bool = False
    is_uploader: bool = False


class CommentsResponse(BaseModel):
    items: list[Comment]
    next_page_token: str | None = None
    disabled: bool = False
    total: int | None = None
