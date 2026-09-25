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

Double-click `Start MusicBox.bat` in the repo root. It starts the backend and the
frontend in two minimized windows and opens the app in your browser. Close those
two windows to stop MusicBox.

Or start each part yourself.

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

## Browsing

MusicBox is laid out like YouTube:

- **Home** shows videos you have not finished, the latest uploads from your
  subscriptions, and trending videos
- **Search** lists matching channels and videos, with filters for upload date,
  length and sort order, and loads more results as you scroll
- **Channel pages** have Videos, Shorts, Live and Playlists tabs. Open one from
  any channel name or avatar
- **Playlists** open as a page with every video, "Play all", and ZIP or
  combined-MP3 downloads
- **Subscriptions** and **History** are kept in this browser. Subscribe from a
  channel page or under a video

Every video card has a ⋮ menu to listen to audio only, download, save to a
playlist, save the thumbnail, copy the link or open it on YouTube.

## Watching

The watch page plays videos in the app at up to the best quality YouTube offers,
including 1440p and 4K. YouTube serves HD as separate video and audio files, and
the player keeps the two in sync. It has:

- quality, playback speed (0.25x to 4x), subtitles/CC and loop in the ⚙ menu
- chapters on the progress bar, frame previews when hovering over it, and the
  "most replayed" graph
- theater mode, full screen and picture-in-picture
- autoplay of the next video with a countdown, and resuming where you left off
- a description with clickable timestamps, and comments
- media-key support

Keyboard shortcuts match YouTube: `k`/space play or pause, `j`/`l` jump 10 s,
arrow keys jump 5 s (up/down change volume while over the player), `m` mute,
`f` full screen, `t` theater mode, `c` subtitles, `i` picture-in-picture,
`<`/`>` speed, `0`–`9` jump to 0–90 %, `,`/`.` step a frame while paused, and
`Shift+N` next video.

A video you downloaded to the library plays from the local file. Live streams
use the YouTube player, and the ⚙ menu can switch any video to it.

## Downloading

The download dialog lets you choose:

- **Format**: MP3 audio, or MP4 video with sound
- **Video quality**: best available, or capped at 4K / 1440p / 1080p / 720p /
  480p / 360p
- **Destination**: the server library (Downloads), or straight to the device you
  are browsing from
- **Section**: the whole video, the first 5 / 10 / 30 minutes, or a custom range
  set with the slider or typed as `1:30` to `4:00`

### Downloading a specific timestamp

On the watch page, press **Clip** under the video:

1. Drag the two blue handles on the progress bar, or press `[` and `]` while
   the video plays to mark the start and end at the current moment. You can
   also type exact times such as `1:02.5`.
2. Press **Preview** to play just that section.
3. Press **Download section…**. The download dialog opens with the range filled
   in.

Device downloads are built on demand and streamed back as a file attachment, so
nothing is added to the library. Because the file is prepared server-side first,
a long section takes a while before the browser starts saving it.

## Notes
- The backend checks HTTPS certificates against the Windows certificate store
  (via `truststore`). Without it, antivirus HTTPS scanning makes every YouTube
  request fail with `CERTIFICATE_VERIFY_FAILED`.
- Trending videos, upload dates, channel avatars and search need
  `YOUTUBE_API_KEY`. Channel pages, playback and downloads work without it.
- `backend/.env` is gitignored and intended to stay local only.
- Downloaded MP3 and MP4 files under `backend/data/downloads/` are also gitignored.
- Device downloads are built in `backend/data/downloads/_direct/` and deleted once
  the response has been sent; the folder is also cleared on backend startup.
- Playlists are persisted locally through a lightweight JSON registry.
- Section downloads and video merging both rely on `ffmpeg`, so `FFMPEG_BINARY`
  must resolve for those features to work.
