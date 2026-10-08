from copy import deepcopy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
import httpx

from app.api.movies import router
from app.core.config import Settings, get_settings
from app.services.movies import open_films
from app.services.movies.metadata import MetadataError

TITLE = 'open:movie:big-buck-bunny'
FILM = open_films.BY_ID[TITLE]


def response_data():
    return {'uuid': FILM.video_id, 'account': {'name': 'blender', 'host': 'video.blender.org'},
            'privacy': {'id': 1}, 'duration': 596,
            'files': [{'resolution': {'id': height}, 'fileUrl': f'{open_films.ORIGIN}/object-storage/web_videos/{FILM.video_id}-{height}.mp4'}
                      for height in (1080, 720, 480)]}


class OpenFilmProviderTests(unittest.TestCase):
    def setUp(self):
        open_films._CACHE.clear()

    def test_catalogue_needs_no_network_or_credentials(self):
        with patch('app.services.movies.open_films.httpx.Client', side_effect=AssertionError('Unexpected network')):
            items = open_films.catalogue()
            self.assertEqual(len(items), 4)
            self.assertEqual(len(open_films.catalogue('sintel')), 1)
            self.assertEqual(open_films.catalogue(kind='show'), [])
            self.assertEqual(len(open_films.catalogue(genre=16)), 3)
            self.assertTrue(all(i['online_source']['licence_url'].startswith('https://') for i in items))

    def test_urls_are_pinned_to_exact_creator_paths(self):
        good = response_data()['files'][0]['fileUrl']
        self.assertTrue(open_films.valid_file_url(good, FILM.video_id, 1080))
        for value in (good.replace('https:', 'http:'), good.replace('video.blender.org', 'video.blender.org.evil.example'),
                      good.replace('video.blender.org', 'user:pass@video.blender.org'), good+'?redirect=1', good+'#fragment',
                      good.replace(FILM.video_id, 'different'), 'https://127.0.0.1/file.mp4', 'https://[bad'):
            self.assertFalse(open_films.valid_file_url(value, FILM.video_id, 1080))

    def test_resolution_checks_identity_caches_and_defaults_to_720(self):
        original = httpx.Client
        requests = []
        def handler(request):
            requests.append(request)
            self.assertEqual(str(request.url), f'{open_films.ORIGIN}/api/v1/videos/{FILM.video_id}')
            self.assertNotIn('authorization', request.headers)
            return httpx.Response(200, json=response_data())
        with patch('app.services.movies.open_films.httpx.Client', side_effect=lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs)):
            selected, variants = open_films.resolve(TITLE)
            self.assertEqual(selected['height'], 720)
            self.assertFalse(any('url' in v for v in variants))
            self.assertEqual(open_films.resolve(TITLE, 'blender:480')[0]['height'], 480)
            self.assertEqual(len(requests), 1)
            with self.assertRaises(LookupError):
                open_films.resolve(TITLE, 'blender:9999')

    def test_wrong_publishers_redirects_and_malformed_data_fail_closed(self):
        original = httpx.Client
        wrong = deepcopy(response_data())
        wrong['account']['name'] = 'some-uploader'
        for status, payload, headers in [(200, wrong, {}), (200, {'files': []}, {}), (200, [], {}),
                                          (302, {}, {'Location': 'http://127.0.0.1/private'}), (429, {}, {})]:
            with self.subTest(status=status, payload=payload):
                transport = httpx.MockTransport(lambda request: httpx.Response(status, json=payload, headers=headers))
                with patch('app.services.movies.open_films.httpx.Client', side_effect=lambda **kwargs: original(transport=transport, **kwargs)):
                    with self.assertRaises(MetadataError):
                        open_films.resolve(TITLE)

    def test_unknown_title_is_not_a_url_resolver(self):
        with patch('app.services.movies.open_films.httpx.Client', side_effect=AssertionError('Unexpected network')):
            with self.assertRaises(LookupError):
                open_films.resolve('open:movie:https://example.com')


class HybridMovieApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.settings = Settings(_env_file=None, MOVIES_ENABLED=True, MOVIES_MEDIA_DIR='',
                                 MOVIES_TMDB_TOKEN='', MOVIES_DATA_DIR=Path(self.temp.name)/'movies')
        self.app = FastAPI()
        self.app.include_router(router, prefix='/api')
        self.app.dependency_overrides[get_settings] = lambda: self.settings
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app, client=('127.0.0.1', 1)), base_url='http://test')
        self.addAsyncCleanup(self.client.aclose)

    async def test_free_catalogue_and_saved_title_work_without_metadata_key(self):
        with patch('app.services.movies.open_films.variants', side_effect=AssertionError('No stream resolution while browsing')):
            response = await self.client.get('/api/movies/catalogue?source=free')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.json()['items']), 4)
            self.assertTrue(response.json()['items'][0]['playable'])
            self.assertEqual((await self.client.get('/api/movies/catalogue?source=local')).json()['items'], [])
            profile = (await self.client.get('/api/movies/profiles')).json()[0]['id']
            saved = await self.client.put(f'/api/movies/profiles/{profile}/watchlist/{TITLE}', headers={'X-MusicBox-Movies': '1'}, json={'saved': True})
            self.assertEqual(saved.status_code, 200)
            self.assertEqual((await self.client.get(f'/api/movies/profiles/{profile}/watchlist')).json()[0]['id'], TITLE)

    async def test_free_toggle_fails_closed_and_retains_saved_metadata(self):
        self.settings.movies_free_streaming_enabled = False
        self.assertEqual((await self.client.get('/api/movies/catalogue?source=free')).json()['items'], [])
        self.assertFalse((await self.client.get('/api/movies/status')).json()['playback_available'])
        self.assertFalse((await self.client.get(f'/api/movies/titles/{TITLE}')).json()['playable'])

    async def test_remote_session_quality_and_progress_do_not_store_urls(self):
        profile = (await self.client.get('/api/movies/profiles')).json()[0]['id']
        asset = {'id': 'blender:480', 'label': '480p', 'available': True, 'height': 480, 'duration': 596,
                 'source_type': 'remote', 'url': response_data()['files'][2]['fileUrl']}
        with patch('app.api.movies.open_films.resolve', return_value=(asset, [{k: v for k, v in asset.items() if k != 'url'}])):
            url = f'/api/movies/profiles/{profile}/playback/{TITLE}?asset_id=blender:480'
            self.assertEqual((await self.client.post(url)).status_code, 403)
            session = (await self.client.post(url, headers={'X-MusicBox-Movies': '1'})).json()
            self.assertEqual(session['source_type'], 'remote')
            self.assertEqual(session['asset_id'], 'blender:480')
            self.assertTrue(session['url'].startswith(open_films.ORIGIN))
            response = await self.client.put(f'/api/movies/profiles/{profile}/progress/{TITLE}', headers={'X-MusicBox-Movies': '1'},
                                            json={'session_id': session['session_id'], 'sequence': 1, 'position': 42, 'duration': 596})
            self.assertTrue(response.json()['accepted'])
            self.assertEqual((await self.client.post(url, headers={'X-MusicBox-Movies': '1'})).json()['resume'], 42)
        from app.services.movies.repository import MoviesRepository
        snapshot = MoviesRepository(self.settings.movies_data_dir).title(TITLE)
        self.assertNotIn('/object-storage/', str(snapshot))
