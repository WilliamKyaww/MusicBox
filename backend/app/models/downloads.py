from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator

DownloadStatus = Literal["queued", "downloading", "converting", "completed", "failed"]
MediaKind = Literal["audio", "video"]
VideoQuality = Literal["best", "2160", "1440", "1080", "720", "480", "360"]


class DownloadSection(BaseModel):
    """Optional time window to keep from the source video."""

    start_seconds: int = Field(default=0, ge=0)
    end_seconds: int | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def validate_range(self) -> "DownloadSection":
        if self.end_seconds is not None and self.end_seconds <= self.start_seconds:
            raise ValueError("Section end must be after the section start.")

        return self

    @property
    def is_full(self) -> bool:
        return self.start_seconds == 0 and self.end_seconds is None


class DownloadRequest(BaseModel):
    video_id: str
    title: str
    channel_title: str = ""
    thumbnail_url: HttpUrl | None = None
    source_url: HttpUrl | None = None
    media_kind: MediaKind = "audio"
    video_quality: VideoQuality = "best"
    section: DownloadSection | None = None


class UpdateDownloadRequest(BaseModel):
    title: str


class DownloadRuntimeStatus(BaseModel):
    available: bool
    missing_dependencies: list[str]
    downloads_directory: str


class DownloadJob(BaseModel):
    id: str
    video_id: str
    title: str
    channel_title: str
    thumbnail_url: HttpUrl | None = None
    source_url: HttpUrl
    status: DownloadStatus
    status_detail: str | None = None
    progress_percent: int
    created_at: str
    updated_at: str
    error_message: str | None = None
    file_name: str | None = None
    file_size_bytes: int | None = None
    download_path: str | None = None
    thumbnail_path: str | None = None
    media_kind: MediaKind = "audio"
    video_quality: VideoQuality = "best"
    section_start_seconds: int = 0
    section_end_seconds: int | None = None


class DownloadListResponse(BaseModel):
    runtime: DownloadRuntimeStatus
    items: list[DownloadJob]


class EnqueueDownloadResponse(BaseModel):
    job: DownloadJob
    deduplicated: bool


class RemoveDownloadResponse(BaseModel):
    removed_job_id: str
    deleted_file: bool
