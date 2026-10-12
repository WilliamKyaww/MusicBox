"""Give FFmpeg bounded HTTP range reads through yt-dlp's network client."""

import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from secrets import token_urlsafe
from urllib.parse import urlsplit

from yt_dlp.networking import Request


class MediaRangeProxy:
    def __init__(self, downloader, cancelled=None):
        self.downloader = downloader
        self.cancelled = cancelled
        self.sources = {}
        self.token = token_urlsafe(24)
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                owner.serve(self)

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.daemon_threads = True
        self.server.block_on_close = False
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': 0.1}, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def wrap(self, info):
        for item in [info, *info.get('formats', []), *info.get('requested_formats', [])]:
            url = item.get('url', '')
            parsed = urlsplit(url)
            if parsed.scheme != 'https' or not parsed.hostname or not parsed.hostname.endswith('.googlevideo.com'):
                continue
            if item.get('protocol') not in ('http', 'https'):
                continue
            route = f'/{self.token}/{len(self.sources)}'
            self.sources[route] = (url, item.get('http_headers') or info.get('http_headers') or {})
            item['url'] = f'http://127.0.0.1:{self.server.server_port}{route}'
            item['protocol'] = 'http'

    def serve(self, handler):
        source = self.sources.get(handler.path)
        if source is None or (self.cancelled and self.cancelled.is_set()):
            handler.send_error(404)
            return
        match = re.fullmatch(r'bytes=(\d+)-(\d*)', handler.headers.get('Range', 'bytes=0-'))
        if not match:
            handler.send_error(416)
            return
        start = int(match[1])
        # Explicit finite ranges avoid hanging on an open-ended Googlevideo read.
        end = min(int(match[2]) if match[2] else start + 1024 * 1024 - 1, start + 1024 * 1024 - 1)
        url, headers = source
        try:
            with self.downloader.urlopen(Request(url, headers={**headers, 'Range': f'bytes={start}-{end}'})) as response:
                if response.status != 206 or not response.headers.get('Content-Range'):
                    handler.send_error(502, 'The media source did not accept a range request.')
                    return
                handler.send_response(206)
                for name in ('Content-Type', 'Content-Length', 'Content-Range'):
                    if response.headers.get(name):
                        handler.send_header(name, response.headers[name])
                handler.send_header('Accept-Ranges', 'bytes')
                handler.end_headers()
                remaining = end - start + 1
                while remaining > 0:
                    if self.cancelled and self.cancelled.is_set():
                        return
                    chunk = response.read(min(65536, remaining))
                    if not chunk:
                        return
                    handler.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            handler.close_connection = True
