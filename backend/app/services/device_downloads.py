"""Temporary preparation jobs; completed media is delivered in a separate request."""

import re
import threading
import time
from uuid import uuid4

from app.services.downloads import get_download_manager, _kill_job_processes, _forget_job_processes

READY_SECONDS = 3600


class DeviceDownloads:
    def __init__(self):
        self.lock = threading.RLock()
        self.jobs = {}

    def start(self, request):
        manager = get_download_manager()
        runtime = manager.get_runtime_status()
        if not runtime.available:
            raise ValueError(' '.join(runtime.missing_dependencies))
        with self.lock:
            self._prune()
            if sum(job['status'] in ('queued', 'preparing') for job in self.jobs.values()) >= 4:
                raise ValueError('Four device downloads are already preparing. Wait or cancel one before trying again.')
            task_id = uuid4().hex
            self.jobs[task_id] = dict(id=task_id, status='queued', detail='Waiting for a download slot...',
                progress=None, result=None, cancelled=threading.Event(), touched=time.monotonic())
            threading.Thread(target=self._run, args=(task_id, request, manager), daemon=True).start()
            return self.status(task_id)

    def _prune(self):
        expired = [key for key, job in self.jobs.items() if job['status'] not in ('queued', 'preparing') and time.monotonic() - job['touched'] > READY_SECONDS]
        for key in expired:
            job = self.jobs.pop(key)
            if job['result']:
                get_download_manager().cleanup_direct_download(job['result'].cleanup_dir)

    def status(self, task_id):
        with self.lock:
            self._prune()
            job = self.jobs[task_id]
            return {key: job[key] for key in ('id', 'status', 'detail', 'progress')} | {
                'download_path': f'/api/downloads/device/{task_id}/file' if job['status'] == 'ready' else None,
            }

    def file(self, task_id):
        with self.lock:
            self._prune()
            job = self.jobs[task_id]
            if job['status'] != 'ready':
                raise ValueError('The file is not ready to download.')
            job['touched'] = time.monotonic()
            return job['result']

    def cancel(self, task_id):
        with self.lock:
            job = self.jobs[task_id]
            if job['status'] in ('queued', 'preparing'):
                job['cancelled'].set()
                job.update(status='cancelled', detail='Download cancelled.', touched=time.monotonic())
                _kill_job_processes(task_id)
            return self.status(task_id)

    def _run(self, task_id, request, manager):
        job = self.jobs[task_id]

        def progress(data):
            with self.lock:
                if job['cancelled'].is_set():
                    raise RuntimeError('Download cancelled.')
                status = data.get('status')
                detail = 'Preparing the video source...'
                percent = None
                if status == 'cutting':
                    detail = 'Downloading and cutting the selected section...'
                elif status == 'downloading':
                    detail = 'Downloading media...'
                    total = data.get('total_bytes') or data.get('total_bytes_estimate')
                    if total:
                        percent = min(99, int(100 * data.get('downloaded_bytes', 0) / total))
                elif status == 'finished':
                    detail = 'Finishing the file...'
                job.update(status='preparing', detail=detail, progress=percent)

        try:
            result = manager.prepare_direct_download(request, progress_hook=progress,
                cancelled=job['cancelled'], task_id=task_id)
            with self.lock:
                if job['cancelled'].is_set():
                    manager.cleanup_direct_download(result.cleanup_dir)
                else:
                    job.update(status='ready', detail='Ready to save.', progress=100, result=result)
        except Exception as error:
            with self.lock:
                if not job['cancelled'].is_set():
                    detail = re.sub(r'https?://\S+', '[source URL]', str(error))[:400]
                    job.update(status='failed', detail=f'Could not prepare the download. {detail} Try again or choose a lower quality.')
        finally:
            job['touched'] = time.monotonic()
            _forget_job_processes(task_id)


device_downloads = DeviceDownloads()
