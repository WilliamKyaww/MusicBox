from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
import httpx
from app.api.movies import router
from app.core.config import Settings, get_settings
from app.services.movies.repository import MoviesRepository, _SCHEMA
from app.services.movies.media import resolve_media
from app.services.movies.metadata import TMDB, MetadataError, _CACHE

PROBE = {'label':'720p','height':720,'duration':120,'video_codec':'h264','audio_codec':'aac'}
GUARD = {'X-MusicBox-Movies':'1'}


class MovieWorkflows(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.media=self.root/'media'
        self.media.mkdir()
        (self.media/'film.mp4').write_bytes(bytes(range(256))*16)
        (self.media/'film.en.vtt').write_text('WEBVTT\n\n00:00.000 --> 00:01.000\nExample\n',encoding='utf-8')
        self.settings=Settings(_env_file=None,MOVIES_ENABLED=True,MOVIES_MEDIA_DIR=str(self.media),MOVIES_DATA_DIR=self.root/'data',MOVIES_TMDB_TOKEN='')
        self.app=FastAPI()
        self.app.include_router(router,prefix='/api')
        self.app.dependency_overrides[get_settings]=lambda:self.settings
        self.client=httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app,client=('127.0.0.1',1234)),base_url='http://test')
        self.addAsyncCleanup(self.client.aclose)
        self.mock_probe=patch('app.api.movies.probe_media',return_value=PROBE)
        self.mock_probe.start()
        self.addCleanup(self.mock_probe.stop)
        self.profile=(await self.client.get('/api/movies/profiles')).json()[0]['id']

    async def register(self,**extra):
        response=await self.client.post('/api/movies/library',headers=GUARD,json={'title':'Test Film','relative_path':'film.mp4','rights_confirmed':True,**extra})
        self.assertEqual(response.status_code,201,response.text)
        return response.json()

    async def test_registration_is_idempotent_and_paths_are_private(self):
        item=await self.register()
        repeated=await self.register()
        self.assertEqual(item['id'],repeated['id'])
        self.assertNotIn(str(self.media),json.dumps(item))
        self.assertNotIn('relative_path',json.dumps(item))
        result=(await self.client.get('/api/movies/catalogue?source=local')).json()
        self.assertEqual(len(result['items']),1)
        self.assertTrue(result['items'][0]['playable'])
        self.assertEqual((await self.client.get('/api/movies/catalogue?q=test')).json()['items'][0]['title'],'Test Film')

    async def test_guards_disabled_feature_and_rights(self):
        response=await self.client.post('/api/movies/profiles',json={'name':'Guest'})
        self.assertEqual(response.status_code,403)
        response=await self.client.post('/api/movies/library',headers=GUARD,json={'title':'No','relative_path':'film.mp4','rights_confirmed':False})
        self.assertEqual(response.status_code,422)
        self.settings.movies_enabled=False
        self.assertEqual((await self.client.get('/api/movies/catalogue')).status_code,403)

    async def test_remote_access_denied(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app,client=('203.0.113.2',99)),base_url='http://test') as remote:
            self.assertEqual((await remote.get('/api/movies/profiles')).status_code,403)
            self.assertFalse((await remote.get('/api/movies/status')).json()['local_access'])

    async def test_intro_markers_and_rights_timestamp(self):
        bad=await self.client.post('/api/movies/library',headers=GUARD,json={'title':'Invalid','relative_path':'film.mp4','rights_confirmed':True,'intro_start':20,'intro_end':10})
        self.assertEqual(bad.status_code,422)
        item=await self.register(intro_start=5,intro_end=15)
        self.assertEqual(item['assets'][0]['intro_end'],15)
        stored=MoviesRepository(self.settings.movies_data_dir).asset(item['assets'][0]['id'])
        self.assertGreater(stored['rights_confirmed_at'],0)

    async def test_range_head_subtitles_and_unregister_do_not_delete_files(self):
        item=await self.register()
        asset=item['assets'][0]['id']
        response=await self.client.get(f'/api/movies/assets/{asset}/file',headers={'Range':'bytes=10-19'})
        self.assertEqual(response.status_code,206)
        self.assertEqual(response.content,bytes(range(10,20)))
        self.assertEqual(response.headers['content-range'],'bytes 10-19/4096')
        self.assertEqual((await self.client.head(f'/api/movies/assets/{asset}/file')).content,b'')
        self.assertEqual((await self.client.get(f'/api/movies/assets/{asset}/file',headers={'Range':'bytes=99999-'})).status_code,416)
        session=(await self.client.post(f"/api/movies/profiles/{self.profile}/playback/{item['id']}",headers=GUARD)).json()
        self.assertEqual(len(session['subtitles']),1)
        self.assertTrue((await self.client.get(session['subtitles'][0]['url'])).text.startswith('WEBVTT'))
        await self.client.delete(f'/api/movies/assets/{asset}',headers=GUARD)
        self.assertTrue((self.media/'film.mp4').exists())
        self.assertEqual((await self.client.get(f'/api/movies/assets/{asset}/file')).status_code,404)

    async def test_profiles_lists_resume_stale_updates_and_history(self):
        item=await self.register()
        other=(await self.client.post('/api/movies/profiles',headers=GUARD,json={'name':'Guest'})).json()['id']
        await self.client.put(f"/api/movies/profiles/{self.profile}/watchlist/{item['id']}",headers=GUARD,json={'saved':True})
        self.assertEqual(len((await self.client.get(f'/api/movies/profiles/{self.profile}/watchlist')).json()),1)
        self.assertEqual((await self.client.get(f'/api/movies/profiles/{other}/watchlist')).json(),[])
        url=f"/api/movies/profiles/{self.profile}/playback/{item['id']}"
        session=(await self.client.post(url,headers=GUARD)).json()
        progress=f"/api/movies/profiles/{self.profile}/progress/{item['id']}"
        body={'session_id':session['session_id'],'sequence':2,'position':45,'duration':120}
        self.assertTrue((await self.client.put(progress,headers=GUARD,json=body)).json()['accepted'])
        self.assertFalse((await self.client.put(progress,headers=GUARD,json={**body,'sequence':1,'position':3})).json()['accepted'])
        resumed=(await self.client.post(url,headers=GUARD)).json()
        self.assertEqual(resumed['resume'],45)
        self.assertFalse((await self.client.put(progress,headers=GUARD,json={**body,'sequence':3})).json()['accepted'])
        completed={**body,'session_id':resumed['session_id'],'sequence':1,'position':120}
        await self.client.put(progress,headers=GUARD,json=completed)
        self.assertEqual((await self.client.post(url,headers=GUARD)).json()['resume'],0)
        await self.client.delete(f'/api/movies/profiles/{self.profile}/history',headers=GUARD)
        self.assertEqual((await self.client.get(f'/api/movies/profiles/{self.profile}/history')).json(),[])
        self.assertEqual((await self.client.delete(f'/api/movies/profiles/{self.profile}',headers=GUARD)).status_code,422)
        self.assertEqual((await self.client.delete(f'/api/movies/profiles/{other}',headers=GUARD)).status_code,204)

    async def test_tv_episodes_and_missing_files(self):
        episode=await self.register(show_title='Local Series',season=2,episode=3)
        self.assertEqual(episode['kind'],'episode')
        episodes=(await self.client.get(f"/api/movies/titles/{episode['show_id']}/seasons/2")).json()
        self.assertEqual(episodes[0]['episode'],3)
        (self.media/'film.mp4').unlink()
        response=await self.client.post(f"/api/movies/profiles/{self.profile}/playback/{episode['id']}",headers=GUARD)
        self.assertEqual(response.status_code,404)

    async def test_path_traversal_cannot_register_outside_root(self):
        (self.root/'outside.mp4').write_bytes(b'private')
        for value in ('../outside.mp4',str(self.root/'outside.mp4'),'https://example.com/film.mp4'):
            response=await self.client.post('/api/movies/library',headers=GUARD,json={'title':'Bad','relative_path':value,'rights_confirmed':True})
            self.assertEqual(response.status_code,422)
        self.mock_probe.stop()
        with self.assertRaises(ValueError):
            resolve_media(str(self.media),'../outside.mp4')


class MetadataAndMigration(unittest.TestCase):
    def test_v1_schema_migrates_without_losing_profile(self):
        with tempfile.TemporaryDirectory() as folder:
            repo=MoviesRepository(Path(folder))
            with closing(sqlite3.connect(repo.path)) as db,db:
                for statement in _SCHEMA:
                    db.execute(statement)
                db.execute("INSERT INTO profiles VALUES('original','Original',1)")
                db.execute('PRAGMA user_version=1')
            self.assertEqual(repo.initialise(),'original')
            self.assertEqual(repo.profiles()[0]['name'],'Original')

    def test_metadata_token_is_header_only_and_cache_is_bounded(self):
        _CACHE.clear()
        with patch('app.services.movies.metadata.httpx.Client') as client:
            response=httpx.Response(200,json={'results':[{'id':17,'title':'A Film','adult':False,'media_type':'movie'}],'total_pages':3},request=httpx.Request('GET','https://api.themoviedb.org/3/search/multi'))
            client.return_value.__enter__.return_value.get.return_value=response
            api=TMDB('test-token')
            result=api.browse('film')
            self.assertEqual(result['items'][0]['id'],'tmdb:movie:17')
            api.browse('film')
            call=client.return_value.__enter__.return_value.get
            self.assertEqual(call.call_count,1)
            self.assertEqual(call.call_args.kwargs['headers']['Authorization'],'Bearer test-token')
            self.assertNotIn('test-token',call.call_args.args[0])
            self.assertNotIn('test-token',json.dumps(result))

    def test_metadata_failures_do_not_leak_credentials(self):
        _CACHE.clear()
        with patch('app.services.movies.metadata.httpx.Client') as client:
            client.return_value.__enter__.return_value.get.return_value=httpx.Response(401,request=httpx.Request('GET','https://api.themoviedb.org'))
            with self.assertRaises(MetadataError) as error:
                TMDB('never-return-this').get('movie/popular')
            self.assertNotIn('never-return-this',str(error.exception))
