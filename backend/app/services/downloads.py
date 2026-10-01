import asyncio
import html
import json
import math
import mimetypes
import re
import shutil
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings
from app.models.downloads import (
    DownloadJob,
    DownloadRequest,
    DownloadRuntimeStatus,
    DownloadSection,
    UpdateDownloadRequest,
)

import httpx

try:
    import yt_dlp
    from yt_dlp.downloader import external as _ytdlp_external
    from yt_dlp.postprocessor import ffmpeg as _ytdlp_ffmpeg
    from yt_dlp.utils import DownloadCancelled, Popen as _YtdlpPopen, download_range_func
except ImportError:  # pragma: no cover - depends on local environment
    yt_dlp = None
    download_range_func = None
    DownloadCancelled = RuntimeError

# Section downloads, merging and MP3 conversion all run ffmpeg as a child
# process that reports no progress, so a cancel flag alone would only take effect
# once ffmpeg finished. Every process yt-dlp starts from a job's worker thread is
# recorded here, letting a cancel stop it straight away.
_job_context = threading.local()
_job_processes: dict[str, list] = {}
_killed_job_ids: set[str] = set()
_job_processes_lock = threading.Lock()

if yt_dlp is not None:

    class _TrackedPopen(_YtdlpPopen):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            job_id = getattr(_job_context, "job_id", None)
            if not job_id:
                return
            with _job_processes_lock:
                killed = job_id in _killed_job_ids
                if not killed:
                    _job_processes.setdefault(job_id, []).append(self)
            if killed:
                # Started after the cancel: stop it before it does any work.
                self.kill()

    _ytdlp_external.Popen = _TrackedPopen
    _ytdlp_ffmpeg.Popen = _TrackedPopen


def _kill_job_processes(job_id: str) -> None:
    with _job_processes_lock:
        _killed_job_ids.add(job_id)
        processes = _job_processes.pop(job_id, [])
    for process in processes:
        try:
            process.kill()
        except OSError:
            pass


def _forget_job_processes(job_id: str) -> None:
    with _job_processes_lock:
        _job_processes.pop(job_id, None)
        _killed_job_ids.discard(job_id)

INVALID_FILENAME_PATTERN = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
MULTISPACE_PATTERN = re.compile(r"\s+")
FORMAT_FRAGMENT_PATTERN = re.compile(r"\.f\d+\.[^.]+$")
ACTIVE_JOB_STATUSES = {"queued", "downloading", "converting"}
DOWNLOAD_REGISTRY_FILENAME = "jobs.json"
DIRECT_DOWNLOAD_DIRNAME = "_direct"
MISSING_FILE_ERROR = "The saved media file could not be found on disk."
# Registries written before video downloads existed use the older MP3-only wording.
MISSING_FILE_ERRORS = {
    MISSING_FILE_ERROR,
    "The saved MP3 file could not be found on disk.",
}
MEDIA_EXTENSIONS: dict[str, tuple[str, ...]] = {
    "audio": ("mp3",),
    "video": ("mp4", "mkv", "webm"),
}
VIDEO_MEDIA_TYPES = {
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
}


class DownloadRuntimeError(RuntimeError):
    """Raised when the local machine is missing a tool required for downloads."""


@dataclass(slots=True)
class DirectDownload:
    """A one-off download that is streamed to the caller and then discarded."""

    file_path: Path
    file_name: str
    media_type: str
    cleanup_dir: Path


@dataclass(slots=True)
class _DownloadRecord:
    id: str
    video_id: str
    title: str
    channel_title: str
    thumbnail_url: str | None
    source_url: str
    status: str
    status_detail: str | None
    progress_percent: int
    created_at: str
    updated_at: str
    error_message: str | None = None
    file_name: str | None = None
    file_size_bytes: int | None = None
    file_path: Path | None = None
    thumbnail_path: Path | None = None
    media_kind: str = "audio"
    video_quality: str = "best"
    section_start_seconds: int = 0
    section_end_seconds: int | None = None

    def to_public_model(self) -> DownloadJob:
        download_path = None
        if self.status == "completed" and self.file_path:
            download_path = f"/api/downloads/{self.id}/file"
        thumbnail_path = None
        if self.thumbnail_path and self.thumbnail_path.exists():
            thumbnail_path = f"/api/downloads/{self.id}/thumbnail"

        return DownloadJob(
            id=self.id,
            video_id=self.video_id,
            title=self.title,
            channel_title=self.channel_title,
            thumbnail_url=self.thumbnail_url,
            source_url=self.source_url,
            status=self.status,  # type: ignore[arg-type]
            status_detail=self.status_detail,
            progress_percent=self.progress_percent,
            created_at=self.created_at,
            updated_at=self.updated_at,
            error_message=self.error_message,
            file_name=self.file_name,
            file_size_bytes=self.file_size_bytes,
            download_path=download_path,
            thumbnail_path=thumbnail_path,
            media_kind=self.media_kind,  # type: ignore[arg-type]
            video_quality=self.video_quality,  # type: ignore[arg-type]
            section_start_seconds=self.section_start_seconds,
            section_end_seconds=self.section_end_seconds,
        )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sanitize_filename(value: str) -> str:
    cleaned = INVALID_FILENAME_PATTERN.sub("", value).strip()
    cleaned = MULTISPACE_PATTERN.sub(" ", cleaned)
    cleaned = cleaned.strip(". ")

    if not cleaned:
        return "download"

    return cleaned[:120]


def _decode_text(value: str) -> str:
    return html.unescape(value)


def _format_clock(total_seconds: int) -> str:
    hours, remainder = divmod(max(0, total_seconds), 3600)
    minutes, seconds = divmod(remainder, 60)

    if hours > 0:
        return f"{hours}h{minutes:02d}m{seconds:02d}s"
    if minutes > 0:
        return f"{minutes}m{seconds:02d}s"

    return f"{seconds}s"


def _section_suffix(start_seconds: int, end_seconds: int | None) -> str:
    """Filename fragment that keeps section downloads distinguishable on disk."""
    if start_seconds == 0 and end_seconds is None:
        return ""
    if start_seconds == 0:
        return f" (first {_format_clock(end_seconds or 0)})"
    if end_seconds is None:
        return f" (from {_format_clock(start_seconds)})"

    return f" ({_format_clock(start_seconds)}-{_format_clock(end_seconds)})"


def _dedup_key(
    video_id: str,
    media_kind: str,
    start_seconds: int,
    end_seconds: int | None,
) -> str:
    """Only identical requests (same media and same section) share a job."""
    return f"{video_id}:{media_kind}:{start_seconds}:{end_seconds if end_seconds is not None else 'end'}"


def media_type_for_file(file_path: Path) -> str:
    suffix = file_path.suffix.lower()
    if suffix in VIDEO_MEDIA_TYPES:
        return VIDEO_MEDIA_TYPES[suffix]
    if suffix == ".mp3":
        return "audio/mpeg"

    return mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"


class DownloadManager:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.settings.downloads_dir.mkdir(parents=True, exist_ok=True)
        self._registry_path = self.settings.downloads_dir / DOWNLOAD_REGISTRY_FILENAME
        self._jobs: dict[str, _DownloadRecord] = {}
        self._active_jobs_by_key: dict[str, str] = {}
        self._cancelled_job_ids: set[str] = set()
        self._lock = threading.RLock()
        self._worker_semaphore = threading.BoundedSemaphore(
            max(1, self.settings.max_concurrent_downloads)
        )
        self._restore_jobs_from_disk()
        self._purge_direct_download_dir()

    def get_runtime_status(self) -> DownloadRuntimeStatus:
        missing: list[str] = []
        ffmpeg_binary = self._resolve_ffmpeg_binary()

        if yt_dlp is None:
            missing.append("Install yt-dlp in backend/.venv with `pip install yt-dlp`.")

        if ffmpeg_binary is None:
            missing.append(
                "Install ffmpeg and add it to your PATH, or set FFMPEG_BINARY in backend/.env."
            )

        return DownloadRuntimeStatus(
            available=not missing,
            missing_dependencies=missing,
            downloads_directory=str(self.settings.downloads_dir),
        )

    def list_jobs(self) -> list[DownloadJob]:
        with self._lock:
            ordered = sorted(
                self._jobs.values(),
                key=lambda item: item.created_at,
                reverse=True,
            )
            return [item.to_public_model() for item in ordered]

    def get_job(self, job_id: str) -> DownloadJob:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)

            return job.to_public_model()

    def update_job(self, job_id: str, request: UpdateDownloadRequest) -> DownloadJob:
        normalized_title = self._normalize_title(request.title)

        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)

            if job.status in ACTIVE_JOB_STATUSES:
                raise DownloadRuntimeError(
                    "Active downloads cannot be renamed yet. Wait for the job to finish."
                )

            if job.status == "completed" and job.file_path and job.file_path.exists():
                section_suffix = _section_suffix(
                    job.section_start_seconds, job.section_end_seconds
                )
                base_name = _sanitize_filename(
                    f"{normalized_title} [{job.video_id}]{section_suffix}"
                )
                target_path = job.file_path.with_name(
                    f"{base_name}{job.file_path.suffix}"
                )
                if target_path != job.file_path:
                    if target_path.exists():
                        raise DownloadRuntimeError(
                            "A file with that saved-song name already exists."
                        )
                    try:
                        job.file_path.rename(target_path)
                    except OSError as exc:
                        raise DownloadRuntimeError(
                            "Could not rename the saved media file on disk."
                        ) from exc

                    job.file_path = target_path
                    job.file_name = target_path.name

            job.title = normalized_title
            job.updated_at = _utc_now()
            self._persist_registry_unlocked()
            return job.to_public_model()

    def get_file_path(self, job_id: str) -> Path:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)

            if job.status != "completed" or job.file_path is None:
                raise DownloadRuntimeError("This download is not ready yet.")

            return job.file_path

    def get_thumbnail_path(self, job_id: str) -> Path:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)

            if job.thumbnail_path is None or not job.thumbnail_path.exists():
                raise DownloadRuntimeError("This download does not have a saved thumbnail.")

            return job.thumbnail_path

    def get_ffmpeg_binary(self) -> str | None:
        return self._resolve_ffmpeg_binary()

    def find_completed_job_for_video(
        self,
        video_id: str,
        *,
        media_kind: str = "audio",
    ) -> DownloadJob | None:
        """Return the newest complete (un-trimmed) local file for a video, if any."""
        with self._lock:
            candidates = sorted(
                (
                    job
                    for job in self._jobs.values()
                    if job.video_id == video_id
                    and job.status == "completed"
                    and job.media_kind == media_kind
                    and job.section_start_seconds == 0
                    and job.section_end_seconds is None
                ),
                key=lambda item: item.updated_at,
                reverse=True,
            )

            for candidate in candidates:
                if candidate.file_path and candidate.file_path.exists():
                    return candidate.to_public_model()

            return None

    def remove_job(self, job_id: str, *, delete_file: bool = True) -> tuple[str, bool]:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)

            if job.status in ACTIVE_JOB_STATUSES:
                raise DownloadRuntimeError(
                    "Active downloads cannot be removed yet. Wait for the job to finish."
                )

            deleted_file = False
            job_dir = self.settings.downloads_dir / job.id
            if job_dir.exists() and (delete_file or job.file_path is None):
                deleted_file = delete_file and job.file_path is not None and job.file_path.exists()
                shutil.rmtree(job_dir, ignore_errors=True)

            self._jobs.pop(job_id, None)
            self._persist_registry_unlocked()

            return job_id, deleted_file

    def cancel_job(self, job_id: str) -> str:
        """Stop a queued or running download and forget it, removing partial files."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)

            if job.status not in ACTIVE_JOB_STATUSES:
                raise DownloadRuntimeError("Only queued or running downloads can be cancelled.")

            self._cancelled_job_ids.add(job_id)
            self._release_active_job(job_id)
            self._jobs.pop(job_id, None)
            self._persist_registry_unlocked()

        # The worker thread notices the cancel, stops and deletes the job folder.
        _kill_job_processes(job_id)
        return job_id

    def _is_cancelled(self, job_id: str) -> bool:
        with self._lock:
            return job_id in self._cancelled_job_ids

    def redownload_job(self, job_id: str) -> tuple[DownloadJob, bool]:
        runtime = self.get_runtime_status()
        if not runtime.available:
            raise DownloadRuntimeError(
                "Download prerequisites are missing. "
                + " ".join(runtime.missing_dependencies)
            )

        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)

            if job.status in ACTIVE_JOB_STATUSES:
                return job.to_public_model(), True

            if job.status != "failed":
                raise DownloadRuntimeError("Only failed downloads can be redownloaded.")

            job_key = _dedup_key(
                job.video_id,
                job.media_kind,
                job.section_start_seconds,
                job.section_end_seconds,
            )
            existing_job_id = self._active_jobs_by_key.get(job_key)
            if existing_job_id:
                return self._jobs[existing_job_id].to_public_model(), True

            job_dir = self.settings.downloads_dir / job.id
            if job_dir.exists():
                shutil.rmtree(job_dir, ignore_errors=True)

            job.status = "queued"
            job.status_detail = "Waiting for an available worker slot."
            job.progress_percent = 0
            job.error_message = None
            job.file_name = None
            job.file_size_bytes = None
            job.file_path = None
            job.thumbnail_path = None
            job.updated_at = _utc_now()
            self._active_jobs_by_key[job_key] = job.id
            self._persist_registry_unlocked()

        asyncio.create_task(self._run_job(job_id))
        return job.to_public_model(), False

    def ensure_download_sync(self, request: DownloadRequest, *, timeout_seconds: int = 900) -> DownloadJob:
        existing_completed = self.find_completed_job_for_video(
            request.video_id, media_kind=request.media_kind
        )
        if existing_completed is not None:
            return existing_completed

        section = request.section or DownloadSection()

        with self._lock:
            existing_job_id = self._active_jobs_by_key.get(
                _dedup_key(
                    request.video_id,
                    request.media_kind,
                    section.start_seconds,
                    section.end_seconds,
                )
            )
            if existing_job_id:
                target_job_id = existing_job_id
            else:
                job_id = uuid4().hex
                record = self._build_record(job_id, request, section)
                self._jobs[job_id] = record
                self._active_jobs_by_key[
                    _dedup_key(
                        request.video_id,
                        request.media_kind,
                        section.start_seconds,
                        section.end_seconds,
                    )
                ] = job_id
                self._persist_registry_unlocked()
                target_job_id = job_id

        if existing_job_id:
            return self._wait_for_completion_sync(target_job_id, timeout_seconds=timeout_seconds)

        self._run_job_sync(target_job_id)
        return self._wait_for_completion_sync(target_job_id, timeout_seconds=timeout_seconds)

    def enqueue_download(self, request: DownloadRequest) -> tuple[DownloadJob, bool]:
        runtime = self.get_runtime_status()
        if not runtime.available:
            raise DownloadRuntimeError(
                "Download prerequisites are missing. "
                + " ".join(runtime.missing_dependencies)
            )

        section = request.section or DownloadSection()
        job_key = _dedup_key(
            request.video_id,
            request.media_kind,
            section.start_seconds,
            section.end_seconds,
        )

        with self._lock:
            existing_job_id = self._active_jobs_by_key.get(job_key)
            if existing_job_id:
                return self._jobs[existing_job_id].to_public_model(), True

            job_id = uuid4().hex
            record = self._build_record(job_id, request, section)
            self._jobs[job_id] = record
            self._active_jobs_by_key[job_key] = job_id
            self._persist_registry_unlocked()

        asyncio.create_task(self._run_job(job_id))
        return record.to_public_model(), False

    def _build_record(
        self,
        job_id: str,
        request: DownloadRequest,
        section: DownloadSection,
    ) -> _DownloadRecord:
        timestamp = _utc_now()
        source_url = str(
            request.source_url or f"https://www.youtube.com/watch?v={request.video_id}"
        )

        return _DownloadRecord(
            id=job_id,
            video_id=request.video_id,
            title=_decode_text(request.title or request.video_id),
            channel_title=_decode_text(request.channel_title),
            thumbnail_url=str(request.thumbnail_url) if request.thumbnail_url else None,
            source_url=source_url,
            status="queued",
            status_detail="Waiting for an available worker slot.",
            progress_percent=0,
            created_at=timestamp,
            updated_at=timestamp,
            media_kind=request.media_kind,
            video_quality=request.video_quality,
            section_start_seconds=section.start_seconds,
            section_end_seconds=section.end_seconds,
        )

    async def _run_job(self, job_id: str) -> None:
        await asyncio.to_thread(self._run_job_sync, job_id)

    def _run_job_sync(self, job_id: str) -> None:
        self._worker_semaphore.acquire()
        _job_context.job_id = job_id
        try:
            if not self._is_cancelled(job_id):
                self._download_with_yt_dlp(job_id)
        except Exception as exc:  # pragma: no cover - depends on local tools/network
            if not self._is_cancelled(job_id):
                self._mark_failed(job_id, str(exc))
        finally:
            _job_context.job_id = None
            _forget_job_processes(job_id)
            if self._is_cancelled(job_id):
                shutil.rmtree(self.settings.downloads_dir / job_id, ignore_errors=True)
                with self._lock:
                    self._cancelled_job_ids.discard(job_id)
            self._release_active_job(job_id)
            self._worker_semaphore.release()

    def _build_ydl_opts(
        self,
        *,
        media_kind: str,
        video_quality: str,
        section_start_seconds: int,
        section_end_seconds: int | None,
        output_template: str,
        ffmpeg_binary: str,
        progress_hooks: list,
    ) -> dict:
        """Shared yt-dlp options for queued jobs and direct-to-device downloads."""
        ydl_opts: dict = {
            "outtmpl": output_template,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "ffmpeg_location": ffmpeg_binary,
            "progress_hooks": progress_hooks,
        }

        if media_kind == "video":
            if video_quality == "best":
                ydl_opts["format"] = "bestvideo*+bestaudio/best"
            else:
                height = int(video_quality)
                ydl_opts["format"] = (
                    f"bestvideo[height<={height}]+bestaudio/"
                    f"best[height<={height}]/best"
                )
            ydl_opts["merge_output_format"] = "mp4"
        else:
            ydl_opts["format"] = "bestaudio/best"
            ydl_opts["postprocessors"] = [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ]

        if section_start_seconds > 0 or section_end_seconds is not None:
            if download_range_func is None:  # pragma: no cover - defensive guard
                raise DownloadRuntimeError(
                    "This yt-dlp build cannot download partial sections. Upgrade yt-dlp."
                )

            ydl_opts["download_ranges"] = download_range_func(
                None,
                [
                    (
                        float(section_start_seconds),
                        float(section_end_seconds)
                        if section_end_seconds is not None
                        else math.inf,
                    )
                ],
            )
            ydl_opts["force_keyframes_at_cuts"] = True

        if self.settings.youtube_cookies_file:
            ydl_opts["cookiefile"] = self.settings.youtube_cookies_file

        if self.settings.po_token_server_url:
            ydl_opts["extractor_args"] = {
                "youtubepot-bgutilhttp": {
                    "base_url": [self.settings.po_token_server_url],
                },
            }

        return ydl_opts

    def _download_with_yt_dlp(self, job_id: str) -> None:
        if yt_dlp is None:  # pragma: no cover - defensive guard
            raise DownloadRuntimeError("yt-dlp is not installed.")

        settings = self.settings

        with self._lock:
            job = self._jobs[job_id]
            media_kind = job.media_kind
            video_quality = job.video_quality
            section_start_seconds = job.section_start_seconds
            section_end_seconds = job.section_end_seconds
            section_suffix = _section_suffix(section_start_seconds, section_end_seconds)
            safe_base_name = _sanitize_filename(
                f"{job.title} [{job.video_id}]{section_suffix}"
            )
            job_dir = settings.downloads_dir / job_id

        media_label = "video" if media_kind == "video" else "audio"

        job_dir.mkdir(parents=True, exist_ok=True)
        thumbnail_path = self._download_thumbnail(job_id, job_dir)
        output_template = str(job_dir / f"{safe_base_name}.%(ext)s")

        def progress_hook(progress_data: dict) -> None:
            if self._is_cancelled(job_id):
                raise DownloadCancelled("The download was cancelled.")

            status = progress_data.get("status")

            if status == "downloading":
                total_bytes = progress_data.get("total_bytes") or progress_data.get(
                    "total_bytes_estimate"
                )
                downloaded_bytes = progress_data.get("downloaded_bytes")
                percent = 8

                if isinstance(total_bytes, (int, float)) and total_bytes > 0 and isinstance(
                    downloaded_bytes, (int, float)
                ):
                    ratio = max(0.0, min(1.0, downloaded_bytes / total_bytes))
                    percent = int(8 + ratio * 82)

                detail = progress_data.get("_percent_str")
                self._update_job(
                    job_id,
                    status="downloading",
                    progress_percent=max(1, min(percent, 90)),
                    status_detail=(
                        f"Downloading {media_label} stream ({str(detail).strip()})"
                        if detail
                        else f"Downloading {media_label} stream"
                    ),
                )
            elif status == "finished":
                self._update_job(
                    job_id,
                    status="converting",
                    progress_percent=92,
                    status_detail=(
                        "Video download complete. Merging into MP4..."
                        if media_kind == "video"
                        else "Audio download complete. Converting to MP3..."
                    ),
                )

        self._update_job(
            job_id,
            status="downloading",
            progress_percent=2,
            status_detail=f"Preparing YouTube {media_label} download...",
        )

        ffmpeg_binary = self._resolve_ffmpeg_binary()
        if ffmpeg_binary is None:
            raise DownloadRuntimeError(
                "ffmpeg could not be found. Install it or set FFMPEG_BINARY in backend/.env."
            )

        ydl_opts = self._build_ydl_opts(
            media_kind=media_kind,
            video_quality=video_quality,
            section_start_seconds=section_start_seconds,
            section_end_seconds=section_end_seconds,
            output_template=output_template,
            ffmpeg_binary=ffmpeg_binary,
            progress_hooks=[progress_hook],
        )

        with self._lock:
            source_url = self._jobs[job_id].source_url

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([source_url])

        if self._is_cancelled(job_id):
            raise DownloadCancelled("The download was cancelled.")

        final_file = self._locate_final_file(job_dir, media_kind)
        if final_file is None:
            raise DownloadRuntimeError(
                f"The download completed but no {'MP4' if media_kind == 'video' else 'MP3'} "
                "file was produced. Make sure ffmpeg is installed and available on PATH."
            )

        self._update_job(
            job_id,
            status="completed",
            progress_percent=100,
            status_detail=(
                "Video is ready to save."
                if media_kind == "video"
                else "MP3 is ready to save."
            ),
            file_name=final_file.name,
            file_size_bytes=final_file.stat().st_size,
            file_path=final_file,
            thumbnail_path=thumbnail_path,
            error_message=None,
        )

    def prepare_direct_download(self, request: DownloadRequest) -> DirectDownload:
        """Download straight to a scratch folder for immediate delivery to the device.

        Nothing is added to the saved-songs registry; the caller is responsible for
        removing `cleanup_dir` once the response has been sent.
        """
        runtime = self.get_runtime_status()
        if not runtime.available:
            raise DownloadRuntimeError(
                "Download prerequisites are missing. "
                + " ".join(runtime.missing_dependencies)
            )

        ffmpeg_binary = self._resolve_ffmpeg_binary()
        if ffmpeg_binary is None:  # pragma: no cover - covered by runtime status
            raise DownloadRuntimeError(
                "ffmpeg could not be found. Install it or set FFMPEG_BINARY in backend/.env."
            )

        section = request.section or DownloadSection()
        section_suffix = _section_suffix(section.start_seconds, section.end_seconds)
        title = _decode_text(request.title or request.video_id)
        safe_base_name = _sanitize_filename(f"{title}{section_suffix}")
        scratch_dir = (
            self.settings.downloads_dir / DIRECT_DOWNLOAD_DIRNAME / uuid4().hex
        )
        scratch_dir.mkdir(parents=True, exist_ok=True)

        ydl_opts = self._build_ydl_opts(
            media_kind=request.media_kind,
            video_quality=request.video_quality,
            section_start_seconds=section.start_seconds,
            section_end_seconds=section.end_seconds,
            output_template=str(scratch_dir / f"{safe_base_name}.%(ext)s"),
            ffmpeg_binary=ffmpeg_binary,
            progress_hooks=[],
        )
        source_url = str(
            request.source_url or f"https://www.youtube.com/watch?v={request.video_id}"
        )

        self._worker_semaphore.acquire()
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([source_url])

            final_file = self._locate_final_file(scratch_dir, request.media_kind)
        except Exception:
            shutil.rmtree(scratch_dir, ignore_errors=True)
            raise
        finally:
            self._worker_semaphore.release()

        if final_file is None:
            shutil.rmtree(scratch_dir, ignore_errors=True)
            raise DownloadRuntimeError(
                "The download finished but no media file was produced. "
                "Make sure ffmpeg is installed and available on PATH."
            )

        return DirectDownload(
            file_path=final_file,
            file_name=final_file.name,
            media_type=media_type_for_file(final_file),
            cleanup_dir=scratch_dir,
        )

    @staticmethod
    def cleanup_direct_download(cleanup_dir: Path) -> None:
        shutil.rmtree(cleanup_dir, ignore_errors=True)

    def _purge_direct_download_dir(self) -> None:
        """Drop scratch files left behind by an interrupted direct download."""
        direct_dir = self.settings.downloads_dir / DIRECT_DOWNLOAD_DIRNAME
        if direct_dir.exists():
            shutil.rmtree(direct_dir, ignore_errors=True)

    def _release_active_job(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return

            job_key = _dedup_key(
                job.video_id,
                job.media_kind,
                job.section_start_seconds,
                job.section_end_seconds,
            )
            if self._active_jobs_by_key.get(job_key) == job_id:
                self._active_jobs_by_key.pop(job_key, None)

    def _mark_failed(self, job_id: str, message: str) -> None:
        self._update_job(
            job_id,
            status="failed",
            progress_percent=0,
            status_detail="Download failed.",
            error_message=message,
        )

    def _update_job(self, job_id: str, **changes: object) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return

            for field_name, value in changes.items():
                setattr(job, field_name, value)

            job.updated_at = _utc_now()
            self._persist_registry_unlocked()

    def _wait_for_completion_sync(self, job_id: str, *, timeout_seconds: int) -> DownloadJob:
        deadline = datetime.now(timezone.utc).timestamp() + timeout_seconds

        while datetime.now(timezone.utc).timestamp() < deadline:
            job = self.get_job(job_id)
            if job.status == "completed":
                return job
            if job.status == "failed":
                raise DownloadRuntimeError(job.error_message or job.status_detail or "Download failed.")

            threading.Event().wait(0.5)

        raise DownloadRuntimeError("Timed out waiting for the required MP3 download.")

    @staticmethod
    def _locate_final_file(job_dir: Path, media_kind: str = "audio") -> Path | None:
        extensions = MEDIA_EXTENSIONS.get(media_kind, MEDIA_EXTENSIONS["audio"])
        priority = {extension: index for index, extension in enumerate(extensions)}
        candidates = [
            match
            for extension in extensions
            for match in job_dir.glob(f"*.{extension}")
            # Skip the per-format parts yt-dlp leaves behind when a merge is aborted.
            if match.is_file() and not FORMAT_FRAGMENT_PATTERN.search(match.name)
        ]

        if not candidates:
            return None

        # Prefer the preferred container, then the largest file (the merged output).
        candidates.sort(
            key=lambda path: (
                priority.get(path.suffix.lstrip(".").lower(), len(priority)),
                -path.stat().st_size,
            )
        )
        return candidates[0]

    @staticmethod
    def _locate_thumbnail_file(job_dir: Path) -> Path | None:
        for candidate in sorted(job_dir.glob("thumbnail.*")):
            if candidate.is_file():
                return candidate

        return None

    def _download_thumbnail(self, job_id: str, job_dir: Path) -> Path | None:
        with self._lock:
            job = self._jobs.get(job_id)
            thumbnail_url = job.thumbnail_url if job else None

        if not thumbnail_url:
            return None

        try:
            with httpx.Client(timeout=httpx.Timeout(10.0), follow_redirects=True) as client:
                response = client.get(thumbnail_url)
                response.raise_for_status()
        except httpx.HTTPError:
            return None

        content_type = response.headers.get("content-type", "").split(";", 1)[0].strip()
        if not content_type.startswith("image/"):
            return None

        extension = mimetypes.guess_extension(content_type) or ".jpg"
        if extension == ".jpe":
            extension = ".jpg"

        thumbnail_path = job_dir / f"thumbnail{extension}"
        try:
            thumbnail_path.write_bytes(response.content)
        except OSError:
            return None

        return thumbnail_path

    @staticmethod
    def _normalize_title(title: str) -> str:
        normalized = " ".join(_decode_text(title).split()).strip()
        if not normalized:
            raise DownloadRuntimeError("Saved song title cannot be empty.")

        return normalized[:160]

    def _resolve_ffmpeg_binary(self) -> str | None:
        configured = self.settings.ffmpeg_binary.strip()
        if not configured:
            configured = "ffmpeg"

        configured_path = Path(configured)
        if configured_path.is_file():
            return str(configured_path)

        discovered = shutil.which(configured)
        if discovered:
            return discovered

        return None

    def _restore_jobs_from_disk(self) -> None:
        if not self._registry_path.exists():
            return

        try:
            payload = json.loads(self._registry_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return

        if not isinstance(payload, list):
            return

        for item in payload:
            if not isinstance(item, dict):
                continue

            try:
                job = self._deserialize_job(item)
            except (KeyError, TypeError, ValueError):
                continue

            if job.status in ACTIVE_JOB_STATUSES:
                job.status = "failed"
                job.status_detail = "Download interrupted by backend restart."
                job.error_message = "The backend restarted before this job finished."
                job.progress_percent = 0
                job.file_name = None
                job.file_size_bytes = None
                job.file_path = None
                job.thumbnail_path = None
                job.updated_at = _utc_now()

            if job.status == "completed" and job.file_path and not job.file_path.exists():
                if not self._repair_job_file_from_folder(job):
                    job.status = "failed"
                    job.status_detail = "Recorded media file is missing."
                    job.error_message = MISSING_FILE_ERROR
                    job.file_name = None
                    job.file_size_bytes = None
                    job.file_path = None
                    job.thumbnail_path = None
                    job.progress_percent = 0
                    job.updated_at = _utc_now()

            if (
                job.status == "failed"
                and not job.file_path
                and job.error_message in MISSING_FILE_ERRORS
            ):
                self._repair_job_file_from_folder(job)

            self._jobs[job.id] = job

        with self._lock:
            self._persist_registry_unlocked()

    def _repair_job_file_from_folder(self, job: _DownloadRecord) -> bool:
        job_dir = self.settings.downloads_dir / job.id
        final_file = self._locate_final_file(job_dir, job.media_kind)
        if final_file is None:
            return False

        job.status = "completed"
        job.status_detail = (
            "Video is ready to save."
            if job.media_kind == "video"
            else "MP3 is ready to save."
        )
        job.error_message = None
        job.progress_percent = 100
        job.file_path = final_file
        job.file_name = final_file.name
        job.file_size_bytes = final_file.stat().st_size
        job.thumbnail_path = self._locate_thumbnail_file(job_dir)
        job.updated_at = _utc_now()
        return True

    def _persist_registry_unlocked(self) -> None:
        payload = [self._serialize_job(job) for job in self._jobs.values()]
        self._registry_path.write_text(
            json.dumps(payload, indent=2),
            encoding="utf-8",
        )

    @staticmethod
    def _serialize_job(job: _DownloadRecord) -> dict[str, object]:
        return {
            "id": job.id,
            "video_id": job.video_id,
            "title": job.title,
            "channel_title": job.channel_title,
            "thumbnail_url": job.thumbnail_url,
            "source_url": job.source_url,
            "status": job.status,
            "status_detail": job.status_detail,
            "progress_percent": job.progress_percent,
            "created_at": job.created_at,
            "updated_at": job.updated_at,
            "error_message": job.error_message,
            "file_name": job.file_name,
            "file_size_bytes": job.file_size_bytes,
            "file_path": str(job.file_path) if job.file_path else None,
            "thumbnail_path": str(job.thumbnail_path) if job.thumbnail_path else None,
            "media_kind": job.media_kind,
            "video_quality": job.video_quality,
            "section_start_seconds": job.section_start_seconds,
            "section_end_seconds": job.section_end_seconds,
        }

    @staticmethod
    def _deserialize_job(payload: dict[str, object]) -> _DownloadRecord:
        file_path = payload.get("file_path")
        thumbnail_path = payload.get("thumbnail_path")

        return _DownloadRecord(
            id=str(payload["id"]),
            video_id=str(payload["video_id"]),
            title=_decode_text(str(payload["title"])),
            channel_title=_decode_text(str(payload.get("channel_title", ""))),
            thumbnail_url=str(payload["thumbnail_url"]) if payload.get("thumbnail_url") else None,
            source_url=str(payload["source_url"]),
            status=str(payload["status"]),
            status_detail=str(payload["status_detail"]) if payload.get("status_detail") else None,
            progress_percent=int(payload.get("progress_percent", 0)),
            created_at=str(payload["created_at"]),
            updated_at=str(payload["updated_at"]),
            error_message=str(payload["error_message"]) if payload.get("error_message") else None,
            file_name=str(payload["file_name"]) if payload.get("file_name") else None,
            file_size_bytes=(
                int(payload["file_size_bytes"]) if payload.get("file_size_bytes") is not None else None
            ),
            file_path=Path(str(file_path)) if file_path else None,
            thumbnail_path=Path(str(thumbnail_path)) if thumbnail_path else None,
            media_kind=str(payload.get("media_kind") or "audio"),
            video_quality=str(payload.get("video_quality") or "best"),
            section_start_seconds=int(payload.get("section_start_seconds") or 0),
            section_end_seconds=(
                int(payload["section_end_seconds"])
                if payload.get("section_end_seconds") is not None
                else None
            ),
        )


_download_manager: DownloadManager | None = None


def get_download_manager() -> DownloadManager:
    global _download_manager

    if _download_manager is None:
        _download_manager = DownloadManager()

    return _download_manager
