"""TMDB metadata only. No playback URLs are obtained from metadata providers."""

from collections import OrderedDict
from copy import deepcopy
import re
from threading import Lock
import time

import httpx

_CACHE = OrderedDict()
_LOCK = Lock()


class MetadataError(Exception):
    def __init__(self, message, status=503):
        self.status = status
        super().__init__(message)


def image_url(value, size='w500'):
    return f'https://image.tmdb.org/t/p/{size}{value}' if isinstance(value,str) and re.fullmatch(r'/[A-Za-z0-9_.-]+',value) else None


def normalise(data, kind):
    provider_kind = 'tv' if kind == 'show' else 'movie'
    title_id = f"tmdb:{kind}:{int(data['id'])}"
    trailer = next((v for v in data.get('videos',{}).get('results',[]) if v.get('site') == 'YouTube' and v.get('type') == 'Trailer' and re.fullmatch(r'[A-Za-z0-9_-]{11}', v.get('key',''))), None)
    return {
        'id': title_id, 'kind': kind, 'title': data.get('title') or data.get('name') or 'Untitled',
        'description': data.get('overview') or '', 'date': data.get('release_date') or data.get('first_air_date') or '',
        'runtime': data.get('runtime') or next(iter(data.get('episode_run_time') or []), 0),
        'poster': image_url(data.get('poster_path')), 'backdrop': image_url(data.get('backdrop_path'),'w1280'),
        'genres': [g['name'] for g in data.get('genres',[])], 'rating': data.get('vote_average') or 0,
        'cast': [p['name'] for p in data.get('credits',{}).get('cast',[])[:12]],
        'crew': [p['name'] for p in data.get('credits',{}).get('crew',[]) if p.get('job') in ('Director','Creator')][:4],
        'seasons': [{'number':s['season_number'], 'name':s['name'], 'count':s.get('episode_count',0)} for s in data.get('seasons',[])],
        'trailer_url': f"https://www.youtube.com/watch?v={trailer['key']}" if trailer else None,
        'provider_url': f"https://www.themoviedb.org/{provider_kind}/{data['id']}",
        'certification': '', 'available_providers': [],
    }


class TMDB:
    def __init__(self, token, region='GB'):
        self.token = token
        self.region = region if re.fullmatch('[A-Z]{2}',region) else 'GB'

    def get(self, path, **params):
        if not self.token:
            raise MetadataError('Add your TMDB read access token in Settings to browse the online catalogue.', 503)
        params = {'language':'en-GB', **params}
        key = (self.token,path,tuple(sorted(params.items())))
        with _LOCK:
            cached = _CACHE.get(key)
            if cached and cached[0] > time.monotonic():
                return deepcopy(cached[1])
        try:
            with httpx.Client(timeout=10, follow_redirects=False) as client:
                response = client.get('https://api.themoviedb.org/3/' + path, params=params, headers={'Authorization':f'Bearer {self.token}'})
            if response.status_code in (401,403):
                raise MetadataError('TMDB rejected the token. Replace it in Settings.', 503)
            if response.status_code == 404:
                raise MetadataError('This title is no longer available in the metadata catalogue.',404)
            if response.status_code == 429:
                raise MetadataError('TMDB is busy. Please try again shortly.',429)
            response.raise_for_status()
            data = response.json()
            if not isinstance(data,dict):
                raise ValueError()
        except (httpx.HTTPError,ValueError):
            raise MetadataError('The movie metadata service could not be reached. Your local library is still available.') from None
        with _LOCK:
            _CACHE[key] = (time.monotonic()+600,data)
            _CACHE.move_to_end(key)
            while len(_CACHE)>128:
                _CACHE.popitem(last=False)
        return deepcopy(data)

    def browse(self, query='', kind='all', page=1, category='popular', genre=None):
        media = 'tv' if kind == 'show' else 'movie'
        if query:
            path = 'search/' + ('multi' if kind == 'all' else media)
            data = self.get(path, query=query, page=page, include_adult='false')
        elif genre:
            data = self.get('discover/'+media,page=page,with_genres=genre,include_adult='false',sort_by='popularity.desc')
        elif category == 'trending':
            data = self.get('trending/'+('all' if kind=='all' else media)+'/week',page=page)
        else:
            category = 'now_playing' if category == 'new' and media == 'movie' else 'on_the_air' if category == 'new' else category
            data = self.get(media+'/'+category,page=page,region=self.region)
        items=[]
        for row in data.get('results',[]):
            row_type = row.get('media_type',media)
            if row_type not in ('tv','movie') or row.get('adult') or not isinstance(row.get('id'),int):
                continue
            if genre and query and genre not in row.get('genre_ids',[]):
                continue
            items.append(normalise(row,'show' if row_type=='tv' else 'movie'))
        return {'items':items,'page':page,'total_pages':min(int(data.get('total_pages',1)),500)}

    def details(self, title_id):
        match = re.fullmatch(r'tmdb:(movie|show):(\d+)',title_id)
        if not match:
            raise MetadataError('Invalid catalogue title identifier.',404)
        kind, provider_id = match.groups()
        data = self.get(('tv' if kind=='show' else 'movie')+'/'+provider_id,
                        append_to_response='credits,videos,release_dates,content_ratings,watch/providers')
        item = normalise(data,kind)
        if kind=='movie':
            region = next((r for r in data.get('release_dates',{}).get('results',[]) if r.get('iso_3166_1')==self.region),{})
            item['certification'] = next((r.get('certification') for r in region.get('release_dates',[]) if r.get('certification')), '')
        else:
            item['certification'] = next((r.get('rating','') for r in data.get('content_ratings',{}).get('results',[]) if r.get('iso_3166_1')==self.region),'')
        region = data.get('watch/providers',{}).get('results',{}).get(self.region,{})
        item['available_providers'] = list(dict.fromkeys(p['provider_name'] for k in ('flatrate','rent','buy') for p in region.get(k,[])))
        return item

    def episodes(self, show_id, season):
        match = re.fullmatch(r'tmdb:show:(\d+)',show_id)
        if not match:
            raise MetadataError('Invalid show identifier.',404)
        data = self.get(f'tv/{match[1]}/season/{season}')
        return [{
            'id':f"tmdb:episode:{match[1]}:{season}:{e['episode_number']}", 'kind':'episode',
            'title':e.get('name') or f"Episode {e['episode_number']}", 'description':e.get('overview') or '',
            'date':e.get('air_date') or '', 'runtime':e.get('runtime') or 0,
            'poster':image_url(e.get('still_path')), 'backdrop':image_url(e.get('still_path'),'w1280'),
            'show_id':show_id, 'season':season, 'episode':e['episode_number'], 'genres':[], 'cast':[], 'crew':[],
            'rating':e.get('vote_average') or 0, 'seasons':[], 'certification':'', 'available_providers':[],
            'provider_url':f"https://www.themoviedb.org/tv/{match[1]}/season/{season}/episode/{e['episode_number']}",
            'trailer_url':None,
        } for e in data.get('episodes',[]) if isinstance(e.get('episode_number'),int)]
