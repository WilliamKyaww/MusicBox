"""Explicitly registered local media. No remote stream resolver."""
import json
from pathlib import Path
import shutil
import subprocess

TYPES = {'.mp4': 'video/mp4', '.webm': 'video/webm'}


def resolve_media(root_value, relative, suffixes=TYPES):
    if not root_value:
        raise ValueError('Set the Movies media folder in Settings first.')
    root = Path(root_value).expanduser().resolve()
    part = Path(relative)
    if not root.is_dir() or part.is_absolute() or '..' in part.parts or ':' in relative or '\x00' in relative:
        raise ValueError('Choose a relative file inside the configured Movies folder.')
    file = (root / part).resolve()
    if not file.is_relative_to(root) or file.suffix.lower() not in suffixes or not file.is_file():
        raise ValueError('The registered media is missing, unsupported, or outside the Movies folder.')
    return file


def probe_media(file, ffmpeg_binary):
    configured = Path(ffmpeg_binary)
    probe = configured.with_name('ffprobe.exe' if configured.suffix == '.exe' else 'ffprobe') if configured.is_file() else None
    executable = str(probe) if probe and probe.is_file() else shutil.which('ffprobe')
    if not executable:
        raise ValueError('FFprobe is required to register media. Configure FFmpeg or use the packaged desktop app.')
    try:
        result = subprocess.run([executable, '-v', 'error', '-protocol_whitelist', 'file,pipe',
                                '-format_whitelist', 'mov,matroska,webm', '-show_streams', '-show_format', '-of', 'json', str(file)],
                                capture_output=True, timeout=20, check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        data = json.loads(result.stdout)
        video = next(s for s in data['streams'] if s.get('codec_type') == 'video')
        audio = next((s for s in data['streams'] if s.get('codec_type') == 'audio'), {})
        duration = float(data['format'].get('duration', 0))
        if not 0 < duration < 86400 or video.get('codec_name') not in ('h264', 'vp8', 'vp9', 'av1'):
            raise ValueError()
        if audio and audio.get('codec_name') not in ('aac', 'mp3', 'opus', 'vorbis', 'flac'):
            raise ValueError()
        height = int(video.get('height', 0))
        return {'label': f'{height}p', 'height': height, 'duration': duration,
                'video_codec': video['codec_name'], 'audio_codec': audio.get('codec_name', 'none')}
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, StopIteration):
        raise ValueError('This file could not be verified for browser playback. Use a non-DRM MP4 (H.264/AAC) or WebM video.') from None


def subtitles(root_value, file):
    root = Path(root_value).expanduser().resolve()
    items = []
    for candidate in [file.with_suffix('.vtt'), *file.parent.glob(file.stem + '.*.vtt')]:
        resolved = candidate.resolve()
        if resolved.is_relative_to(root) and resolved.is_file() and resolved.stat().st_size <= 2_000_000:
            name = candidate.stem.removeprefix(file.stem).lstrip('.') or 'Subtitles'
            if not any(i['name'] == candidate.name for i in items):
                items.append({'name': candidate.name, 'label': name[:40]})
        if len(items) >= 20:
            break
    return items
