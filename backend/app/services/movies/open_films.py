"""Curated creator-authorised films, not an unrestricted stream-search proxy.

Licence pages and the Blender publisher were checked on 6-7 October 2026.
Keep full films/credits intact. API licence labels alone are not clearance.
"""

from copy import deepcopy
from dataclasses import dataclass
import json
from threading import Lock
import time
from urllib.parse import urlsplit

import httpx

from app.services.movies.metadata import MetadataError

ORIGIN = 'https://video.blender.org'


@dataclass(frozen=True)
class OpenFilm:
    slug: str
    title: str
    video_id: str
    year: str
    seconds: int
    licence: str
    licence_page: str
    attribution: str
    description: str
    genres: tuple[str, ...]


FILMS = (
    OpenFilm('big-buck-bunny', 'Big Buck Bunny', 'bf1f3fb5-b119-4f9f-9930-8e20e892b898', '2008', 596,
             'CC BY 3.0', 'https://peach.blender.org/about/',
             '(c) 2008 Blender Foundation / www.bigbuckbunny.org',
             'A peaceful rabbit meets three mischievous neighbours in this animated open short.', ('Animation', 'Comedy')),
    OpenFilm('sintel', 'Sintel', '0eb052d0-fd51-43e6-aa33-ecdbf77a5d40', '2010', 888,
             'CC BY 3.0', 'https://durian.blender.org/about/',
             '(c) 2010 Blender Foundation / durian.blender.org',
             'A young traveller searches for a dragon in this animated fantasy short.', ('Animation', 'Fantasy')),
    OpenFilm('tears-of-steel', 'Tears of Steel', '8533ea43-4271-4a57-9694-e9d0b35e1aa1', '2012', 734,
             'CC BY 3.0', 'https://mango.blender.org/sharing/',
             '(c) Blender Foundation / mango.blender.org',
             'Live action meets visual effects in a science-fiction story set in a future Amsterdam.', ('Science Fiction',)),
    OpenFilm('elephants-dream', 'Elephants Dream', 'cccc3e60-0291-4ecc-aa56-39b2e2c7d0d5', '2006', 654,
             'Creative Commons Attribution', 'https://orange.blender.org/blog/creative-commons-license-2/',
             '(c) 2006 Blender Foundation / Netherlands Media Art Institute / www.elephantsdream.org',
             'Two characters explore a strange mechanical world in Blender Foundation\'s first open film.', ('Animation', 'Science Fiction')),
)
BY_ID = {f'open:movie:{film.slug}': film for film in FILMS}
GENRES = {16: 'Animation', 35: 'Comedy', 14: 'Fantasy', 878: 'Science Fiction'}
_CACHE: dict[str, tuple[float, list[dict]]] = {}
_LOCK = Lock()


def film_for(title_id):
    film = BY_ID.get(title_id)
    if film is None:
        raise LookupError('This title is not in the approved free-streaming collection.')
    return film


def details(title_id):
    film = film_for(title_id)
    image = f'/movies/{film.slug}.jpg'
    return {
        'id': title_id, 'kind': 'movie', 'title': film.title, 'description': film.description,
        'date': film.year, 'runtime': round(film.seconds / 60), 'poster': image, 'backdrop': image,
        'genres': list(film.genres), 'rating': 0, 'cast': [], 'crew': ['Blender Foundation'],
        'seasons': [], 'trailer_url': None, 'provider_url': None, 'certification': 'Not rated',
        'available_providers': ['Blender Open Movies'],
        'online_source': {'provider': 'Blender Open Movies', 'page_url': f'{ORIGIN}/w/{film.video_id}',
                          'licence': film.licence, 'licence_url': film.licence_page,
                          'attribution': film.attribution, 'verified_on': '2026-10-07'},
    }


def catalogue(query='', kind='all', genre=None):
    if kind == 'show':
        return []
    return [details(title_id) for title_id, film in BY_ID.items()
            if query.casefold() in film.title.casefold()
            and (genre is None or GENRES.get(genre) in film.genres)]


def advertised_asset(title_id):
    film = film_for(title_id)
    # Actual variants are resolved at Play time, so browsing makes no API calls.
    return {'id': 'blender:auto', 'label': 'Free stream', 'available': True,
            'duration': film.seconds, 'height': 0, 'video_codec': 'MP4', 'audio_codec': 'provider',
            'intro_start': 0, 'intro_end': 0, 'source_type': 'remote'}


def valid_file_url(value, video_id, height):
    if not isinstance(value, str):
        return False
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    return (parsed.scheme == 'https' and parsed.netloc == 'video.blender.org'
            and not parsed.query and not parsed.fragment
            and parsed.path == f'/object-storage/web_videos/{video_id}-{height}.mp4')


def variants(title_id):
    film = film_for(title_id)
    with _LOCK:
        cached = _CACHE.get(title_id)
        if cached and cached[0] > time.monotonic():
            return deepcopy(cached[1])
    try:
        # Only this fixed origin and curated UUIDs are fetched; redirects fail closed.
        with httpx.Client(timeout=8, follow_redirects=False) as client:
            with client.stream('GET', f'{ORIGIN}/api/v1/videos/{film.video_id}',
                               headers={'Accept': 'application/json'}) as response:
                response.raise_for_status()
                if response.status_code != 200:
                    raise ValueError('Unexpected redirect')
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > 1_000_000:
                        raise ValueError('Oversized provider response')
                data = json.loads(body)
        if (data.get('uuid') != film.video_id or data.get('account', {}).get('name') != 'blender'
                or data.get('account', {}).get('host') != 'video.blender.org'
                or data.get('privacy', {}).get('id') != 1):
            raise ValueError('Publisher or identity mismatch')
        duration = data['duration']
        if type(duration) not in (int, float) or not 0 < duration <= 86400:
            raise ValueError('Invalid duration')
        result = []
        for entry in data.get('files', [])[:20]:
            height = entry.get('resolution', {}).get('id')
            url = entry.get('fileUrl')
            if type(height) is not int or not 144 <= height <= 2160 or not valid_file_url(url, film.video_id, height):
                continue
            if any(v['id'] == f'blender:{height}' for v in result):
                continue
            result.append({'id': f'blender:{height}', 'label': f'{height}p / free stream',
                           'available': True, 'duration': duration, 'height': height,
                           'video_codec': 'MP4', 'audio_codec': 'provider', 'source_type': 'remote',
                           'intro_start': 0, 'intro_end': 0, 'url': url})
        if not result:
            raise ValueError('No approved MP4 variants')
        result.sort(key=lambda item: item['height'], reverse=True)
    except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError):
        raise MetadataError('The creator-hosted stream is unavailable. Try again later or use an authorised local copy.', 503) from None
    with _LOCK:
        _CACHE[title_id] = (time.monotonic() + 300, result)
    return deepcopy(result)


def resolve(title_id, asset_id=None):
    available = variants(title_id)
    if asset_id and asset_id != 'blender:auto':
        selected = next((item for item in available if item['id'] == asset_id), None)
    else:
        selected = next((item for item in available if item['height'] <= 720), available[-1])
    if selected is None:
        raise LookupError('This online quality is no longer available. Reopen the title and try again.')
    return selected, [{k: v for k, v in item.items() if k != 'url'} for item in available]
