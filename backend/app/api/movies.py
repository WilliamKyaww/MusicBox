"""Local-first movie/TV catalogue and playback, separate from Video/Music."""
import os
import sqlite3
from pathlib import Path
from typing import Literal
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from app.core.config import Settings, get_settings
from app.services.movies.repository import MoviesRepository, SCHEMA_VERSION
from app.services.movies.metadata import TMDB, MetadataError, normalise
from app.services.movies.media import TYPES, resolve_media, probe_media, subtitles

router = APIRouter(prefix='/movies')
LOOPBACK = {'127.0.0.1', '::1', 'localhost', 'testclient'}


def local_access(request):
    return bool(request.client and request.client.host in LOOPBACK) and os.environ.get('MUSICBOX_SETTINGS_READ_ONLY', '').lower() not in ('1', 'true', 'yes')


def active(request: Request, settings: Settings = Depends(get_settings)):
    if not settings.movies_enabled:
        raise HTTPException(403, 'Enable Movies in Settings first.')
    if not local_access(request):
        raise HTTPException(403, 'Movies is currently a private, local-only feature. Hosted accounts are not supported.')
    return settings


def write_access(request: Request, settings: Settings = Depends(active)):
    if request.headers.get('X-MusicBox-Movies') != '1':
        raise HTTPException(403, 'This change must come from the MusicBox app.')
    return settings


def repository(settings):
    return MoviesRepository(settings.movies_data_dir)


def guarded(call, *args):
    try:
        return call(*args)
    except MetadataError as error:
        raise HTTPException(error.status, str(error)) from None
    except LookupError as error:
        raise HTTPException(404, str(error)) from None
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    except sqlite3.Error:
        raise HTTPException(503, 'The Movies database is busy or unavailable. Please try again.') from None


def title(repo, settings, title_id):
    cached = repo.title(title_id)
    if title_id.startswith('local:') or title_id.startswith('tmdb:episode:'):
        if not cached:
            raise LookupError('Title not found. Open its show/season first.')
        return cached
    try:
        return repo.save_title(TMDB(settings.movies_tmdb_token, settings.movies_region).details(title_id))
    except MetadataError:
        if cached:
            return cached
        raise


def decorate(repo, settings, item):
    assets = []
    for asset in repo.assets(item['id']):
        try:
            resolve_media(settings.movies_media_dir, asset['relative_path'])
            available = True
        except ValueError:
            available = False
        assets.append({k: asset[k] for k in ('id', 'label', 'duration', 'height', 'video_codec', 'audio_codec', 'intro_start', 'intro_end')} | {'available': available})
    return {**item, 'assets': assets, 'playable': any(a['available'] for a in assets)}


class ProfileInput(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class SavedInput(BaseModel):
    saved: bool


class LocalInput(BaseModel):
    title: str = Field(default='', max_length=200)
    description: str = Field(default='', max_length=4000)
    relative_path: str = Field(min_length=1, max_length=1500)
    title_id: str | None = Field(default=None, max_length=160)
    rights_confirmed: bool
    show_title: str = Field(default='', max_length=200)
    season: int = Field(default=1, ge=0, le=1000)
    episode: int = Field(default=1, ge=1, le=10000)
    intro_start: float = Field(default=0, ge=0, le=86400, allow_inf_nan=False)
    intro_end: float = Field(default=0, ge=0, le=86400, allow_inf_nan=False)


class ProgressInput(BaseModel):
    session_id: str = Field(min_length=1, max_length=60)
    sequence: int = Field(ge=1, le=2_000_000_000)
    position: float = Field(ge=0, le=86400, allow_inf_nan=False)
    duration: float = Field(gt=0, le=86400, allow_inf_nan=False)


@router.get('/status')
def status(request: Request, response: Response, settings: Settings = Depends(get_settings)):
    response.headers['Cache-Control'] = 'no-store'
    enabled = settings.movies_enabled
    return {'enabled': enabled, 'stage': 'local', 'catalogue_available': enabled and local_access(request),
            'playback_available': enabled and local_access(request) and bool(settings.movies_media_dir),
            'metadata_configured': bool(settings.movies_tmdb_token), 'media_configured': bool(settings.movies_media_dir),
            'local_access': local_access(request), 'schema_version': SCHEMA_VERSION}


@router.get('/profiles')
def profiles(settings: Settings = Depends(active)):
    return guarded(repository(settings).profiles)


@router.post('/profiles', status_code=201)
def create_profile(body: ProfileInput, settings: Settings = Depends(write_access)):
    name = body.name.strip()
    if not name:
        raise HTTPException(422, 'Enter a profile name.')
    return guarded(repository(settings).create_profile, name)


@router.delete('/profiles/{profile_id}', status_code=204)
def delete_profile(profile_id: str, settings: Settings = Depends(write_access)):
    guarded(repository(settings).delete_profile, profile_id)


@router.get('/catalogue')
def catalogue(q: str = Query(default='', max_length=200), kind: Literal['all', 'movie', 'show'] = 'all',
              page: int = Query(default=1, ge=1, le=500), category: Literal['popular', 'trending', 'new', 'top_rated'] = 'popular',
              genre: int | None = Query(default=None, ge=1), source: Literal['online', 'local'] = 'online', settings: Settings = Depends(active)):
    repo = repository(settings)
    if source == 'local' or not settings.movies_tmdb_token:
        items = guarded(repo.local_titles)
        items = [i for i in items if i['kind'] != 'episode' and (kind == 'all' or i['kind'] == kind) and q.casefold() in i['title'].casefold()]
        return {'items': [decorate(repo, settings, i) for i in items[(page-1)*40:page*40]], 'page': page, 'total_pages': max(1, (len(items)+39)//40), 'source': 'local'}
    result = guarded(TMDB(settings.movies_tmdb_token, settings.movies_region).browse, q, kind, page, category, genre)
    result['items'] = [decorate(repo, settings, i) for i in result['items']]
    result['source'] = 'tmdb'
    return result


@router.get('/genres')
def genres(kind: Literal['movie', 'show'] = 'movie', settings: Settings = Depends(active)):
    if not settings.movies_tmdb_token:
        return []
    return guarded(TMDB(settings.movies_tmdb_token).get, 'genre/'+('tv' if kind == 'show' else 'movie')+'/list').get('genres', [])


@router.get('/titles/{title_id}')
def details(title_id: str, settings: Settings = Depends(active)):
    repo = repository(settings)
    return decorate(repo, settings, guarded(title, repo, settings, title_id))


@router.get('/titles/{title_id}/recommendations')
def recommendations(title_id: str, settings: Settings = Depends(active)):
    repo = repository(settings)
    item = guarded(title, repo, settings, title_id)
    local = [i for i in repo.local_titles() if i['id'] != title_id and i['kind'] != 'episode']
    local.sort(key=lambda i: len(set(i.get('genres', [])) & set(item.get('genres', []))), reverse=True)
    if title_id.startswith('tmdb:') and item['kind'] in ('movie', 'show') and settings.movies_tmdb_token:
        data = guarded(TMDB(settings.movies_tmdb_token).get, ('tv' if item['kind'] == 'show' else 'movie')+'/'+title_id.split(':')[-1]+'/recommendations')
        local = [normalise(i, item['kind']) for i in data.get('results', []) if not i.get('adult')] + local
    return [decorate(repo, settings, i) for i in local[:20]]


@router.get('/titles/{show_id}/seasons/{season}')
def episodes(show_id: str, season: int, settings: Settings = Depends(active)):
    if season < 0 or season > 1000:
        raise HTTPException(422, 'Invalid season.')
    repo = repository(settings)
    if show_id.startswith('local:show:'):
        items = [i for i in repo.local_titles() if i.get('show_id') == show_id and i.get('season') == season]
        items.sort(key=lambda i: i['episode'])
    else:
        items = guarded(TMDB(settings.movies_tmdb_token).episodes, show_id, season)
        for item in items:
            repo.save_title(item)
    return [decorate(repo, settings, i) for i in items]


@router.post('/library', status_code=201)
def register_media(body: LocalInput, settings: Settings = Depends(write_access)):
    if not body.rights_confirmed:
        raise HTTPException(422, 'Confirm you are authorised to play this media.')
    file = guarded(resolve_media, settings.movies_media_dir, body.relative_path)
    probe = guarded(probe_media, file, settings.ffmpeg_binary)
    if body.intro_end and not body.intro_start < body.intro_end < probe['duration']:
        raise HTTPException(422, 'Intro markers must be ordered and inside the video duration.')
    probe = {**probe, 'intro_start': body.intro_start, 'intro_end': body.intro_end}
    repo = repository(settings)
    relative = os.path.normcase(str(file.relative_to(Path(settings.movies_media_dir).expanduser().resolve())))
    existing = repo.asset_by_path(relative)
    if existing:
        if body.title_id and body.title_id != existing['title_id']:
            raise HTTPException(409, 'This file is already registered to another title.')
        return decorate(repo, settings, guarded(title, repo, settings, existing['title_id']))
    if body.title_id:
        item = guarded(title, repo, settings, body.title_id)
        if item['kind'] == 'show':
            raise HTTPException(422, 'Register a specific episode, not an entire show.')
    else:
        if not body.title.strip():
            raise HTTPException(422, 'Enter a title.')
        item = {'id': 'local:movie:'+str(uuid4()), 'kind': 'movie', 'title': body.title.strip(), 'description': body.description,
                'date': '', 'runtime': round(probe['duration']/60), 'poster': None, 'backdrop': None, 'genres': [],
                'rating': 0, 'cast': [], 'crew': [], 'seasons': [], 'trailer_url': None, 'provider_url': None,
                'certification': 'Not rated', 'available_providers': []}
        if body.show_title.strip():
            show = next((i for i in repo.local_titles() if i['kind'] == 'show' and i['title'].casefold() == body.show_title.strip().casefold()), None)
            show = show or {**item, 'id': 'local:show:'+str(uuid4()), 'kind': 'show', 'title': body.show_title.strip(), 'runtime': 0, 'description': ''}
            seasons = {s['number']: s for s in show['seasons']}
            seasons[body.season] = {'number': body.season, 'name': f'Season {body.season}', 'count': 0}
            show['seasons'] = sorted(seasons.values(), key=lambda s: s['number'])
            repo.save_title(show)
            item.update(id='local:episode:'+str(uuid4()), kind='episode', show_id=show['id'], season=body.season, episode=body.episode)
            existing_episode = next((i for i in repo.local_titles() if i.get('show_id') == show['id'] and i.get('season') == body.season and i.get('episode') == body.episode), None)
            if existing_episode:
                item = existing_episode
        repo.save_title(item)
    guarded(repo.add_asset, item['id'], relative, probe)
    return decorate(repo, settings, item)


@router.delete('/assets/{asset_id}', status_code=204)
def forget_asset(asset_id: str, settings: Settings = Depends(write_access)):
    guarded(repository(settings).remove_asset, asset_id)


@router.get('/profiles/{profile_id}/watchlist')
def watchlist(profile_id: str, settings: Settings = Depends(active)):
    repo = repository(settings)
    return [decorate(repo, settings, i) for i in guarded(repo.list_saved, profile_id)]


@router.get('/profiles/{profile_id}/history')
def history(profile_id: str, settings: Settings = Depends(active)):
    repo = repository(settings)
    return [decorate(repo, settings, i) for i in guarded(repo.list_saved, profile_id, True)]


@router.delete('/profiles/{profile_id}/history', status_code=204)
def clear_history(profile_id: str, title_id: str | None = None, settings: Settings = Depends(write_access)):
    guarded(repository(settings).remove_history, profile_id, title_id)


@router.get('/profiles/{profile_id}/titles/{title_id}')
def title_state(profile_id: str, title_id: str, settings: Settings = Depends(active)):
    return guarded(repository(settings).state, profile_id, title_id)


@router.put('/profiles/{profile_id}/watchlist/{title_id}')
def save_title(profile_id: str, title_id: str, body: SavedInput, settings: Settings = Depends(write_access)):
    repo = repository(settings)
    if body.saved:
        guarded(title, repo, settings, title_id)
    guarded(repo.set_saved, profile_id, title_id, body.saved)
    return {'saved': body.saved}


@router.post('/profiles/{profile_id}/playback/{title_id}')
def playback(profile_id: str, title_id: str, asset_id: str | None = None, settings: Settings = Depends(write_access)):
    repo = repository(settings)
    item = decorate(repo, settings, guarded(title, repo, settings, title_id))
    asset = next((a for a in item['assets'] if a['available'] and (not asset_id or a['id'] == asset_id)), None)
    if not asset:
        raise HTTPException(404, 'No registered playable file is available for this title. Metadata is not a film stream.')
    record = repo.asset(asset['id'])
    file = guarded(resolve_media, settings.movies_media_dir, record['relative_path'])
    state = guarded(repo.state, profile_id, title_id)
    session = guarded(repo.start_session, profile_id, title_id)
    tracks = [{**t, 'url': f"/api/movies/assets/{asset['id']}/subtitles/{t['name']}"} for t in subtitles(settings.movies_media_dir, file)]
    return {'session_id': session, 'title': item, 'asset_id': asset['id'], 'url': f"/api/movies/assets/{asset['id']}/file",
            'resume': 0 if not state['progress'] or state['progress']['completed'] else state['progress']['position'],
            'duration': asset['duration'], 'subtitles': tracks}


@router.put('/profiles/{profile_id}/progress/{title_id}')
def progress(profile_id: str, title_id: str, body: ProgressInput, settings: Settings = Depends(write_access)):
    accepted = guarded(repository(settings).progress, profile_id, title_id, body.session_id, body.sequence, body.position, body.duration)
    return {'accepted': accepted}


def registered_file(settings, asset_id):
    record = repository(settings).asset(asset_id)
    if not record:
        raise HTTPException(404, 'Registered file not found.')
    return guarded(resolve_media, settings.movies_media_dir, record['relative_path'])


@router.api_route('/assets/{asset_id}/file', methods=['GET', 'HEAD'])
def media_file(asset_id: str, settings: Settings = Depends(active)):
    file = registered_file(settings, asset_id)
    return FileResponse(file, media_type=TYPES[file.suffix.lower()], headers={'Cache-Control': 'private, no-store'})


@router.get('/assets/{asset_id}/subtitles/{name}')
def subtitle_file(asset_id: str, name: str, settings: Settings = Depends(active)):
    file = registered_file(settings, asset_id)
    if name not in [t['name'] for t in subtitles(settings.movies_media_dir, file)]:
        raise HTTPException(404, 'Subtitle track not found.')
    candidate = file.parent/name
    try:
        valid = candidate.read_text(encoding='utf-8-sig').startswith('WEBVTT')
    except (OSError, UnicodeError):
        valid = False
    if not valid:
        raise HTTPException(422, 'Use a UTF-8 WebVTT subtitle file.')
    return FileResponse(candidate, media_type='text/vtt', headers={'Cache-Control': 'private, no-store'})
