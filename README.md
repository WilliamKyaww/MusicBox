# MusicBox

MusicBox is a personal, self-hosted music tool that searches YouTube, queues MP3 downloads locally, and grows into playlist management and local playback over time.

Warning: vibe coded

## Repo structure

```text
backend/
  app/                  FastAPI API, services, and download job logic
  data/downloads/       Runtime-generated MP3 files (gitignored)
  data/playlists/       Runtime-generated playlist registry (local only)
  .env.example          Backend environment template
frontend/
  src/                  React app, search UI, queue UI, and playlist UI
markdown/
  *.md                  Planning and comparison notes
```

## Requirements

- Python 3.14+
- Node.js 24+
- A YouTube Data API key
- `ffmpeg`
- `yt-dlp` is already listed in `backend/requirements.txt`

## Backend setup

Create or update `backend/.env` with:

```env
YOUTUBE_API_KEY=your_key_here
FRONTEND_ORIGIN=http://localhost:5173
YOUTUBE_SEARCH_CACHE_TTL_SECONDS=300
DOWNLOADS_DIR=data/downloads
PLAYLISTS_DIR=data/playlists
MAX_CONCURRENT_DOWNLOADS=2
FFMPEG_BINARY=ffmpeg
```

`FFMPEG_BINARY` can be:

- `ffmpeg` if it is on your `PATH`
- a full path like `C:\\ffmpeg\\bin\\ffmpeg.exe` if you want to point to it directly

## Running the app

Backend:

```powershell
cd backend
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm run dev
```

Open:

```text
http://localhost:5173
```

## Downloading and watching

Every search result has a download button that opens a small options dialog:

- **Format** — MP3 audio, or the MP4 video with sound
- **Video quality** — best available, or capped at 1080p / 720p / 480p / 360p
- **Destination** — save to the server library (Saved Songs), or download straight
  to the device you are browsing from
- **Section** — the whole video, only the first 5 / 10 / 30 minutes, or a custom
  start/end range such as `1:30` to `4:00`

Device downloads are built on demand and streamed back as a file attachment, so
nothing is added to the library. Because the file is prepared server-side first,
a long section takes a while before the browser starts saving it.

Search results and saved songs also have:

- a thumbnail button that saves the video artwork at the largest size YouTube has
- a watch button that plays the video inside the app

The in-app player uses a progressive (already merged) YouTube stream, which is
often only available at 360p. A video you downloaded to the library plays back at
its downloaded quality instead, and the player can fall back to the embedded
YouTube player when a direct stream will not play.

## Notes
- `backend/.env` is gitignored and intended to stay local only.
- Downloaded MP3 and MP4 files under `backend/data/downloads/` are also gitignored.
- Device downloads are built in `backend/data/downloads/_direct/` and deleted once
  the response has been sent; the folder is also cleared on backend startup.
- Playlists are persisted locally through a lightweight JSON registry.
- Section downloads and video merging both rely on `ffmpeg`, so `FFMPEG_BINARY`
  must resolve for those features to work.
