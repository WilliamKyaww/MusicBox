import base64
import re
from typing import Any

import httpx

from app.core.config import get_settings
from app.models.spotify import SpotifyPlaylistPreview, SpotifyPreviewTrack

SPOTIFY_PLAYLIST_URL_PATTERN = re.compile(
    r"https?://open\.spotify\.com/playlist/(?P<playlist_id>[A-Za-z0-9]+)"
)


class SpotifyConfigError(RuntimeError):
    pass


class SpotifyUpstreamError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def extract_playlist_id(playlist_url: str) -> str:
    match = SPOTIFY_PLAYLIST_URL_PATTERN.search(playlist_url)
    if not match:
      raise SpotifyUpstreamError("That does not look like a valid Spotify playlist URL.", status_code=400)
    return match.group("playlist_id")


async def _get_client_credentials_token(client: httpx.AsyncClient) -> str:
    settings = get_settings()

    if not settings.spotify_client_id or not settings.spotify_client_secret:
        raise SpotifyConfigError(
            "Spotify preview needs a Spotify client ID and secret. Add them in Settings."
        )

    basic_auth = base64.b64encode(
        f"{settings.spotify_client_id}:{settings.spotify_client_secret}".encode("utf-8")
    ).decode("utf-8")

    response = await client.post(
        "https://accounts.spotify.com/api/token",
        data={"grant_type": "client_credentials"},
        headers={"Authorization": f"Basic {basic_auth}"},
    )

    if response.status_code >= 400:
        raise SpotifyUpstreamError("Spotify token request failed.", status_code=503)

    payload = response.json()
    access_token = payload.get("access_token")
    if not isinstance(access_token, str):
        raise SpotifyUpstreamError("Spotify token response was malformed.", status_code=503)

    return access_token


async def preview_spotify_playlist(playlist_url: str, max_tracks: int) -> SpotifyPlaylistPreview:
    playlist_id = extract_playlist_id(playlist_url)
    settings = get_settings()

    async with httpx.AsyncClient(timeout=httpx.Timeout(settings.request_timeout_seconds)) as client:
        access_token = await _get_client_credentials_token(client)
        headers = {"Authorization": f"Bearer {access_token}"}

        playlist_response = await client.get(
            f"https://api.spotify.com/v1/playlists/{playlist_id}",
            params={"fields": "id,name,external_urls,owner(display_name),tracks(total,items(track(id,name,duration_ms,album(name),artists(name))))"},
            headers=headers,
        )

        if playlist_response.status_code >= 400:
            raise SpotifyUpstreamError(
                "Spotify playlist lookup failed. Make sure the playlist is public and your app credentials are valid.",
                status_code=503 if playlist_response.status_code in {401, 403, 429} else 502,
            )

        payload = playlist_response.json()
        tracks_payload = payload.get("tracks", {})
        track_items = tracks_payload.get("items", []) if isinstance(tracks_payload, dict) else []
        preview_tracks: list[SpotifyPreviewTrack] = []

        if isinstance(track_items, list):
            for raw_item in track_items[: max(1, min(max_tracks, 50))]:
                if not isinstance(raw_item, dict):
                    continue
                track = raw_item.get("track", {})
                if not isinstance(track, dict):
                    continue
                artists = []
                raw_artists = track.get("artists", [])
                if isinstance(raw_artists, list):
                    artists = [
                        str(artist.get("name"))
                        for artist in raw_artists
                        if isinstance(artist, dict) and artist.get("name")
                    ]

                preview_tracks.append(
                    SpotifyPreviewTrack(
                        spotify_track_id=str(track.get("id", "")),
                        title=str(track.get("name", "Unknown track")),
                        artists=artists,
                        album=(
                            str(track["album"].get("name"))
                            if isinstance(track.get("album"), dict) and track["album"].get("name")
                            else None
                        ),
                        duration_ms=int(track["duration_ms"]) if track.get("duration_ms") is not None else None,
                    )
                )

        return SpotifyPlaylistPreview(
            playlist_id=str(payload.get("id", playlist_id)),
            playlist_name=str(payload.get("name", "Spotify playlist")),
            playlist_owner=(
                str(payload["owner"].get("display_name"))
                if isinstance(payload.get("owner"), dict) and payload["owner"].get("display_name")
                else None
            ),
            playlist_url=str(payload.get("external_urls", {}).get("spotify", playlist_url)),
            total_tracks=(
                int(tracks_payload["total"])
                if isinstance(tracks_payload, dict) and tracks_payload.get("total") is not None
                else len(preview_tracks)
            ),
            preview_tracks=preview_tracks,
        )
