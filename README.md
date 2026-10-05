# MusicBox

MusicBox is a personal media app with Video and Music experiences sharing one library, plus an optional independent Movies/TV workspace for authorised local files and catalogue discovery. It runs as a Windows desktop app or as a web app in your browser.

Warning: vibe coded

## Video and Music Experiences

Use the **Video / Music** switch in the top bar on desktop or web. The switch and the Settings button next to it look and behave the same in both experiences. The app remembers your last music page and the last non-playing video page. Audio continues when switching views; deliberately opening a video stops the audio player to prevent overlapping playback.

- **Video** keeps the YouTube-style browsing, channels, subscriptions, watch history, HD player, captions, comments, chapters, clips, and download tools from `main`.
- **Music** works like Spotify's desktop and phone apps: Your Library, Home with Daily Mixes and On Repeat, search, artist and album pages, Liked Songs, playlists, a Now Playing view, synced lyrics, a full-screen player and a Spotify-style queue.
- Both views use the same backend playlists, downloads, exports, Settings page and Discord Presence integration. No library migration or duplicate backend is needed.
- Artists are YouTube channels, albums are YouTube playlists, play counts are YouTube views, and lyrics come from a video's captions where it has them. Mixes, song radio, autoplay and playlist recommendations are built from YouTube searches.
- Music includes playlist folders and pins, library filters with sort and view options, drag-and-drop onto playlists, Next in queue and Autoplay, right-click song menus, private listening, a sleep timer, media keys, and Spotify's keyboard shortcuts (press Ctrl+/ for the list).
- Likes, folders, pins, playlist descriptions, saved albums, history, play counts and queue preferences stay on this device. A restored queue starts paused. Private listening and the sleep timer reset when the app restarts. Private listening disables new audio history and Discord sharing; it is not an anonymous network mode.

Music view still plays YouTube or your downloaded audio, **not Spotify's streaming catalogue**. The import page can preview Spotify playlist metadata using the existing backend configuration and search individual tracks on YouTube. It does not claim account sync or automatic Spotify playback.

This is not full Spotify feature parity. Spotify Connect, Jam, Blend, AI DJ, licensed lyrics for every song, podcasts/audiobooks, account/cloud sync, Smart Shuffle, crossfade, gapless transitions, equaliser and loudness normalisation are not implemented. Search-based features use YouTube API quota, so search waits for a pause in typing. The researched feature inventory is in `docs/spotify-feature-research-2026-10-03.md` (local documentation).

## Movies and TV

Enable **Settings > Connections > Movies experience** for the independent, Netflix-inspired Movies workspace. It includes a featured hero, catalogue rows, movie/TV search and suggestions, type/genre filters, details, credits, trailers, seasons/episodes, My List, local profiles, Watch History, Continue Watching and recommendations. Browsing Movies keeps existing music playing; starting a film pauses it without clearing the queue.

### Set Up Content

1. In Connections, set **Movies media folder** to a folder on the computer running MusicBox containing files you are authorised to play. Nothing is scanned, uploaded or copied automatically.
2. Open **Movies > My files** and register a relative path such as `Films/My film.mp4`, with a title and rights confirmation. For TV, optionally supply a show title, season and episode number. MP4 with H.264/AAC or WebM is recommended; FFprobe verifies the file before registration. Unregistering a file does not delete the original.
3. Optionally add your own **TMDB read access token** in Connections after reviewing TMDB's terms. This enables online discovery, metadata and regional legal-availability links. Without a token, the app searches and plays your local collection. TMDB does not supply film streams or streaming rights.
4. To attach a file to an online title, open that title's details and choose **Register a local file**. For a TV show, open the specific episode first. A title without a file is explicitly labelled as details-only.

The separate movie player supports play/pause, seeking, resume, volume, fullscreen, speed, keyboard controls, WebVTT subtitles, and selection among registered file qualities. Place `My film.en.vtt` beside `My film.mp4` for subtitles. Optional intro markers supplied during registration enable Skip intro; they are not guessed. TV playback offers the next registered episode, including the next season, with opt-in autoplay. Progress is saved periodically and on pause/seek/navigation; completing 95% marks a title watched.

Movies is **local-first**, not a hosted Netflix service. Profiles separate lists/history on one trusted installation; they are not authenticated accounts or parental controls. Remote/managed-host access to Movies data is rejected. Commercial-film subscriptions, DRM, cloud delivery, adaptive HLS/DASH, transcoding, independent audio-track switching and cross-device sync are not included. No films, paid services, subscriptions or credentials are bundled. Review metadata/image terms before commercial use.

Configuration: `MOVIES_ENABLED` defaults to `false`; `MOVIES_TMDB_TOKEN` is write-only in Settings; `MOVIES_MEDIA_DIR` is the explicit media root; `MOVIES_REGION` defaults to `GB`. Movies SQLite schema v3 lives under `backend/data/movies` (or `MOVIES_DATA_DIR`) on the web, and `%APPDATA%\MusicBox\data\movies` on installed desktop. It never migrates the existing songs/playlists. The status endpoint does not create a database; using enabled Movies data features does.

Movies checks: from `backend`, run `.venv\Scripts\python.exe -m unittest discover -s tests -p "test_movies*.py"`. Frontend unit/browser and desktop tests include Movies. For packaged/installed validation, set `MUSICBOX_SMOKE_MOVIES=1` and optionally `MUSICBOX_SMOKE_MOVIE_FILE` to the absolute path of `frontend/e2e/fixtures/movie.webm`, then launch `MusicBox.exe --smoke-test`. This registers the original generated test clip and verifies playback/progress in disposable configuration/data, never your real library.

Metadata uses TMDB's server-side bearer-token API, with a bounded ten-minute in-memory cache. The attribution logo in `frontend/public/tmdb-logo.svg` is the unmodified logo used by [TMDB's official documentation](https://developer.themoviedb.org/docs/faq), retrieved from `https://files.readme.io/29c6fee-blue_short.svg` on 5 October 2026. The 30-second silent test video is generated from a solid colour using FFmpeg, not movie footage.

## Layout

- **Resizable panels.** Drag the divider beside a panel to resize it, as in Spotify's desktop app. In Video, the guide (200–360 px) and the Watch page's Up Next column (320–560 px) resize; in Music, Your Library (280–480 px) and the Now Playing panel (280–480 px) do. Dragging Your Library below 200 px folds it into the icon rail. A focused divider also responds to the arrow keys, Home and End; double-click it or press Enter to restore the default width. Widths are remembered on this device. On narrow windows the Watch page stacks and its divider is hidden, and pages lay out against the space the panels leave, so nothing scrolls sideways.
- **Sticky headers.** Page titles and their toolbars stay pinned while the content scrolls: Watch History, Downloads, Playlists, Playlist Download, Subscriptions, Settings, Your Library, and the title bar of every Music page.
- **Phones.** In Video, the search box becomes a search button that opens a full-width search bar. Music switches to Spotify's phone layout with a tab bar and mini player.

## Settings

Open **Settings** with the gear button at the right of the top bar, or from the Video guide. The same page appears in both experiences:

- **Connections**: the YouTube Data API key, search cache duration, YouTube cookies file, Spotify Client ID and Client Secret for playlist import, Discord status, and the number of simultaneous downloads. Changes apply straight away, except Simultaneous Downloads, which takes effect after MusicBox restarts.
- **Playback**: Autoplay and the sleep timer.
- **Appearance**: light or dark theme for the Video experience; until you choose, it follows your system. Music always uses its dark theme.
- **Privacy and Data**, **Keyboard Shortcuts** and **About**.

To add your YouTube key, choose **Add key**, paste it and choose **Save**. **Check key** tests it with YouTube first. Keys are write-only: once saved, they are never sent back to the page, which only shows whether one is set; use **Replace** or **Remove** to change it. Settings are saved on the computer running the backend, in `backend/.env` for the web app and when the desktop app runs from source, and in `%APPDATA%\MusicBox\config.env` for the installed desktop app. Both files are outside Git.

For safety, settings can only be changed on the computer running MusicBox: the backend accepts changes only from a loopback address and with a header that other websites cannot send. A hosted (Docker) deployment shows the page read-only; set its values as environment variables instead.

Developers add a setting by appending a `SettingSpec` to `backend/app/core/editable_settings.py`; the page renders it automatically.

## Repo Structure

```text
backend/
  app/                  FastAPI API, services, settings registry and download job logic
  data/                 Runtime downloads, playlists and exports (gitignored)
  setup.cmd             Creates backend\.venv and installs or updates packages
  .env.example          Backend environment template
frontend/
  src/                  React app: Video pages, Music (music/), Movies/TV (movies/), Settings (settings/)
  e2e/, tests/          Playwright browser tests and Node unit tests
desktop/                Electron app, packaging scripts and desktop tests
AGENTS.md               Persistent instructions for contributors and coding agents
docs/                   Local worklog, checklist and research notes (gitignored)
```

## Requirements

- Windows for the desktop app and launchers
- Python 3.11 or newer (developed on 3.14)
- Node.js 24 or newer
- A YouTube Data API key, added in Settings
- `ffmpeg` for section downloads and video merging
- `yt-dlp` is already listed in `backend/requirements.txt`

## Running the App

### Desktop App (Windows)

Double-click `Start MusicBox Desktop.bat`. On first run it creates the backend's Python environment and installs the desktop dependencies. Or run:

```powershell
backend\setup.cmd
cd desktop
npm.cmd ci
npm.cmd start
```

The Electron app builds the interface, starts its own local backend, and opens MusicBox in a desktop window. When launched from source it uses `backend/.env` and the library in `backend/data`. The backend closes when you quit MusicBox. The MusicBox menu opens the settings file, library and backend logs.

To build a Windows installer:

```powershell
cd desktop
npm.cmd run dist
```

This bundles Python, the frontend, FFmpeg and FFprobe. Build dependencies are installed in `desktop/.venv`; installers are generated in `desktop/dist/`. `npm.cmd run pack` produces an unpacked desktop app for testing. If electron-builder fails with `EPERM` while renaming `win-unpacked.tmp` (antivirus or folder sync can lock it), set `MUSICBOX_DIST_DIR` to a folder outside the synced Documents folder and build again.

The installed app stores its configuration in `%APPDATA%\MusicBox\config.env` and its music and playlists in `%APPDATA%\MusicBox\data`. Add your YouTube key in **Settings**. Browser history and subscriptions in the web app are separate from the desktop app's storage. The installer includes no personal keys or library files.

### Web App

Double-click `Start MusicBox.bat` in the repo root. On first run it creates `backend\.venv` with your Python installation and installs the backend and frontend packages; later runs reinstall backend packages only when `requirements.txt` changes. It then starts the backend and the frontend in two minimised windows and opens `http://localhost:5173` once both are ready. Close those two windows to stop MusicBox.

Or start each part yourself:

```powershell
backend\setup.cmd
cd backend
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

```powershell
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173`. The development server listens on `localhost` only, so use that name rather than `127.0.0.1`.

The web app needs no `.env` file to start. Add the YouTube key in Settings; edit `backend/.env` (see `backend/.env.example`) only for options the Settings page does not cover, such as `FFMPEG_BINARY` or the data folders. `FFMPEG_BINARY` can be `ffmpeg` if it is on your `PATH`, or a full path such as `C:\ffmpeg\bin\ffmpeg.exe`.

### Tests

From `frontend`:

- `npm run lint` and `npm run build`
- `npm run test:unit` for queue, routing, lyrics and recommendation logic
- `npm run test:e2e` for browser tests. Install the test browser once with `npx playwright install chromium`, or set `PW_CHANNEL=chrome` (or `msedge`) to use an installed browser. Browser tests use isolated storage, mocked APIs and silent audio, not your real library.

From `desktop`, `npm.cmd test` checks the desktop networking and the real backend, including the settings API. It needs `backend\.venv`, so run `backend\setup.cmd` first.

## Browsing

The Video experience is laid out like YouTube:

- **Home** shows videos you have not finished, the latest uploads from your subscriptions, and trending videos
- **Search** lists matching channels and videos, with filters for upload date, length and sort order, and loads more results as you scroll
- **Channel pages** have Videos, Shorts, Live and Playlists tabs. Open one from any channel name or avatar
- **YouTube playlists** open as a page with every video, "Play all", and ZIP or combined-MP3 downloads
- **Playlists** lists your saved playlists as cards; each opens as a playlist page with Play all, Shuffle, rename, reordering and MP3 downloads
- **Downloads** lists saved songs and videos with search and filters (Audio, Video, In progress, Failed)
- **Playlist Download** saves a whole YouTube playlist as a ZIP of MP3s or one combined MP3
- **Subscriptions** and **Watch History** are kept on this device. Subscribe from a channel page or under a video

Every video card has a ⋮ menu to listen to audio only, download, save to a playlist, save the thumbnail, copy the link or open it on YouTube.

## Watching

The watch page plays videos in the app at up to the best quality YouTube offers, including 1440p and 4K. YouTube serves HD as separate video and audio files, and the player keeps the two in sync. It has:

- quality, playback speed (0.25x to 4x), subtitles/CC and loop in the ⚙ menu
- chapters on the progress bar, frame previews when hovering over it, and the "most replayed" graph
- theatre mode, full screen and picture-in-picture
- autoplay of the next video with a countdown, and resuming where you left off
- a description with clickable timestamps, and comments
- media-key support

Keyboard shortcuts match YouTube: `k`/space play or pause, `j`/`l` jump 10 s, arrow keys jump 5 s (up/down change volume while over the player), `m` mute, `f` full screen, `t` theatre mode, `c` subtitles, `i` picture-in-picture, `<`/`>` speed, `0`–`9` jump to 0–90 %, `,`/`.` step a frame while paused, and `Shift+N` next video.

A video you downloaded to the library plays from the local file. Live streams use the YouTube player, and the ⚙ menu can switch any video to it.

## Downloading

The download dialogue lets you choose:

- **Format**: MP3 audio, or MP4 video with sound
- **Video quality**: best available, or capped at 4K / 1440p / 1080p / 720p / 480p / 360p
- **Destination**: the server library (Downloads), or straight to the device you are browsing from
- **Section**: the whole video, the first 5 / 10 / 30 minutes, or a custom range set with the slider or typed as `1:30` to `4:00`

### Downloading a Specific Timestamp

On the watch page, press **Clip** under the video:

1. Drag the two blue handles on the progress bar, or press `[` and `]` while the video plays to mark the start and end at the current moment. You can also type exact times such as `1:02.5`.
2. Press **Preview** to play just that section.
3. Press **Download section…**. The download dialogue opens with the range filled in.

Device downloads are built on demand and streamed back as a file attachment, so nothing is added to the library. Because the file is prepared server-side first, a long section takes a while before the browser starts saving it.

## Notes

- The backend checks HTTPS certificates against the Windows certificate store (via `truststore`). Without it, antivirus HTTPS scanning makes every YouTube request fail with `CERTIFICATE_VERIFY_FAILED`.
- Trending videos, upload dates, channel avatars and search need a YouTube API key. Channel pages, playback and downloads work without it, and pages that need the key link to Settings. The key is sent to YouTube in a request header rather than in the URL.
- `backend/.env` is gitignored and intended to stay local only.
- Downloaded MP3 and MP4 files under `backend/data/downloads/` are also gitignored.
- Device downloads are built in `backend/data/downloads/_direct/` and deleted once the response has been sent; the folder is also cleared on backend startup.
- Playlists are persisted locally through a lightweight JSON registry.
- Section downloads and video merging both rely on `ffmpeg`, so `FFMPEG_BINARY` must resolve for those features to work.
