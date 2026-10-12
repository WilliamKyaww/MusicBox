import io
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.request import urlopen

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.downloads import router
from app.models.downloads import DownloadRequest
from app.services.device_downloads import DeviceDownloads
from app.services.downloads import DirectDownload
from app.services.media_range_proxy import MediaRangeProxy


class DeviceDownloadTests(unittest.TestCase):
    def test_preparation_returns_immediately_and_file_supports_ranges_and_retries(self):
        with tempfile.TemporaryDirectory() as directory:
            media = Path(directory) / 'clip.mp4'
            media.write_bytes(b'0123456789' * 1000)
            gate = threading.Event()
            result = DirectDownload(media, media.name, 'video/mp4', Path(directory))
            def prepare(request, **kwargs):
                gate.wait(3)
                kwargs['progress_hook']({'status': 'cutting'})
                return result
            manager = SimpleNamespace(get_runtime_status=lambda: SimpleNamespace(available=True), prepare_direct_download=prepare)
            service = DeviceDownloads()
            app = FastAPI()
            app.include_router(router, prefix='/api')
            with patch('app.services.device_downloads.get_download_manager', return_value=manager), patch('app.services.device_downloads.device_downloads', service), TestClient(app) as client:
                response = client.post('/api/downloads/device', json={'video_id': 'fixture', 'title': 'Clip', 'media_kind': 'video'})
                self.assertEqual(response.status_code, 202)
                status_url = f"/api/downloads/device/{response.json()['id']}"
                self.assertEqual(client.get(status_url).json()['status'], 'queued')
                gate.set()
                for _ in range(100):
                    status = client.get(status_url).json()
                    if status['status'] == 'ready':
                        break
                    time.sleep(0.01)
                self.assertEqual(status['status'], 'ready')
                first = client.get(status['download_path'], headers={'Range': 'bytes=0-99'})
                self.assertEqual(first.status_code, 206)
                self.assertEqual(first.content, media.read_bytes()[:100])
                self.assertEqual(client.get(status['download_path']).content, media.read_bytes())

    def test_failure_is_reported_and_cancel_stops_active_work(self):
        service = DeviceDownloads()
        def fail(request, **kwargs):
            raise RuntimeError('YouTube refused the source')
        manager = SimpleNamespace(get_runtime_status=lambda: SimpleNamespace(available=True), prepare_direct_download=fail)
        with patch('app.services.device_downloads.get_download_manager', return_value=manager):
            job = service.start(DownloadRequest(video_id='fixture', title='Clip'))
            for _ in range(100):
                status = service.status(job['id'])
                if status['status'] == 'failed':
                    break
                time.sleep(0.01)
            self.assertEqual(status['status'], 'failed')
            self.assertIn('YouTube refused', status['detail'])
        def wait(request, **kwargs):
            kwargs['cancelled'].wait(3)
            raise RuntimeError('Cancelled')
        manager.prepare_direct_download = wait
        with patch('app.services.device_downloads.get_download_manager', return_value=manager), patch('app.services.device_downloads._kill_job_processes') as kill:
            job = service.start(DownloadRequest(video_id='fixture', title='Clip'))
            self.assertEqual(service.cancel(job['id'])['status'], 'cancelled')
            kill.assert_called_with(job['id'])

    def test_ffmpeg_reads_finite_ranges_without_exposing_arbitrary_urls(self):
        requests = []
        class Response(io.BytesIO):
            status = 206
            headers = {'Content-Length': '1024', 'Content-Range': 'bytes 0-1023/5000000'}
        def fetch(request):
            requests.append(request)
            return Response(b'x' * 1024)
        with MediaRangeProxy(SimpleNamespace(urlopen=fetch)) as proxy:
            info = {'url': 'https://test.googlevideo.com/video', 'protocol': 'https'}
            proxy.wrap(info)
            with urlopen(info['url']) as response:
                self.assertEqual(response.status, 206)
                self.assertEqual(response.read(), b'x' * 1024)
            self.assertEqual(requests[0].headers['Range'], 'bytes=0-1048575')
            untouched = {'url': 'http://localhost/private', 'protocol': 'http'}
            proxy.wrap(untouched)
            self.assertEqual(untouched['url'], 'http://localhost/private')


if __name__ == '__main__':
    unittest.main()
