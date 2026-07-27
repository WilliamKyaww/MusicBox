"""Thumbnail fetching — grabs the best available artwork for a YouTube video."""

import html
import mimetypes
import re
from dataclasses import dataclass

import httpx

VIDEO_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{5,64}$")
INVALID_FILENAME_PATTERN = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
MULTISPACE_PATTERN = re.compile(r"\s+")

# Highest resolution first: not every upload has a maxres/sd variant.
THUMBNAIL_QUALITIES = (
    "maxresdefault",
    "sddefault",
    "hqdefault",
    "mqdefault",
    "default",
)


class ThumbnailError(RuntimeError):
    """Raised when no thumbnail image could be fetched for a video."""


@dataclass(slots=True)
class FetchedThumbnail:
    content: bytes
    media_type: str
    file_name: str


def _sanitize_filename(value: str) -> str:
    cleaned = INVALID_FILENAME_PATTERN.sub("", html.unescape(value)).strip()
    cleaned = MULTISPACE_PATTERN.sub(" ", cleaned)
    cleaned = cleaned.strip(". ")

    return cleaned[:120]


def _try_fetch(client: httpx.Client, url: str) -> tuple[bytes, str] | None:
    try:
        response = client.get(url)
        response.raise_for_status()
    except httpx.HTTPError:
        return None

    media_type = response.headers.get("content-type", "").split(";", 1)[0].strip()
    if not media_type.startswith("image/") or not response.content:
        return None

    return response.content, media_type


def fetch_video_thumbnail(
    video_id: str,
    *,
    thumbnail_url: str | None = None,
    title: str = "",
) -> FetchedThumbnail:
    """Fetch a video's thumbnail, preferring the largest image YouTube still serves."""
    if not VIDEO_ID_PATTERN.match(video_id):
        raise ThumbnailError("That video id does not look valid.")

    candidate_urls: list[str] = []
    if thumbnail_url and thumbnail_url.startswith(("http://", "https://")):
        candidate_urls.append(thumbnail_url)

    candidate_urls.extend(
        f"https://i.ytimg.com/vi/{video_id}/{quality}.jpg"
        for quality in THUMBNAIL_QUALITIES
    )

    with httpx.Client(timeout=httpx.Timeout(10.0), follow_redirects=True) as client:
        for url in candidate_urls:
            fetched = _try_fetch(client, url)
            if fetched is not None:
                content, media_type = fetched
                break
        else:
            raise ThumbnailError("No thumbnail image could be downloaded for this video.")

    extension = mimetypes.guess_extension(media_type) or ".jpg"
    if extension == ".jpe":
        extension = ".jpg"

    base_name = _sanitize_filename(title)
    file_name = (
        f"{base_name} [{video_id}] thumbnail{extension}"
        if base_name
        else f"{video_id} thumbnail{extension}"
    )

    return FetchedThumbnail(
        content=content,
        media_type=media_type,
        file_name=file_name,
    )
