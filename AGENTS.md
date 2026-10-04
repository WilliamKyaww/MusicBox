# Agent Instructions for MusicBox

Persistent preferences for anyone, human or coding agent (Claude Code, Codex and others), working on MusicBox. They apply to every change unless the project owner says otherwise. Keep this file current when a preference changes; do not create a second instruction file.

## Language

- Use **British English** everywhere: UI text, code comments, commit messages and documentation (colour, behaviour, favourite, organise, licence as a noun, centre, cancelled, catalogue). Identifiers that must match an external API keep their original spelling (for example CSS `color`, `center`).
- Format dates and numbers for `en-GB`.
- When you touch a file that still uses American spellings, correct them.

## UI Conventions

- **Headings use Title Case** (for example "Watch History", "Saved Songs", "Your Playlist Downloads"). Short articles, conjunctions and prepositions stay lower case unless they come first or last ("Latest from Your Subscriptions"). Buttons, menu items, labels and body text use sentence case ("New playlist", "Add key").
- **Page headers are sticky.** Page titles, their toolbars (search, filters, sort) and equivalent header areas stay pinned while the content scrolls, in both experiences. Never make an existing sticky header scroll away when changing a page. Video pages use the shared `PageHeader` component; Music views register their title with `useStickyHeader`.
- **Modern, clean and consistent.** Prefer light, crisp layouts: generous spacing, clear hierarchy, rounded cards, icon buttons with tooltips and accessible names, proper loading and empty states, and no horizontal page scrolling at any width. Take inspiration from current YouTube and Spotify, but do not copy their branding, logos or fonts.
- **Reuse before you add.** Shared building blocks live in `frontend/src/components` (`AppControls`, `PageHeader`, `ResizeHandle`, `Switch`, `StatusPanel`, `Icons`) and `frontend/src/shared.css`. The top-bar controls (Video/Music switch and Settings) must look and behave identically in both experiences; style them only through the `.app-controls` rules in `shared.css`.
- **Resizable panels** (the Video guide, the Watch page's Up Next column, Your Library and the Now Playing panel) use `ResizeHandle` and `panelSizes.ts`. A new resizable panel gets an entry in `PANELS` with a sensible minimum and maximum, keyboard support and a double-click reset.
- **Check every UI change** in light and dark themes and at desktop (about 1440 px), tablet (about 1024 px) and phone (390 px) widths.

## Settings and Secrets

- Never hard-code API keys or other secrets, and never print them in the UI, logs, tests, screenshots or commits.
- User-editable settings belong in the registry in `backend/app/core/editable_settings.py`: add a `SettingSpec` and the Settings page renders it. Secrets are write-only: the API reports only whether one is set.
- The web app saves to `backend/.env` and the desktop app to `%APPDATA%\MusicBox\config.env`; both are outside Git. Writes are accepted only from the same computer and need the `X-MusicBox-Settings` header. Hosted images set `MUSICBOX_SETTINGS_READ_ONLY`.
- When testing settings, point `MUSICBOX_CONFIG_FILE` at a scratch file instead of writing to the real configuration.

## Architecture

- `backend/`: FastAPI. Routers are in `app/api`, settings in `app/core`, YouTube, Spotify, Discord and download logic in `app/services`. `backend/setup.cmd` creates `backend/.venv` and reinstalls packages when `requirements.txt` changes.
- `frontend/`: React 19, TypeScript and Vite. The Video experience is `App.tsx` with `pages/`, `layout/` and `watch/`; the Music experience is in `music/`. Both share one audio player, the library API and the Settings page (`settings/`).
- `desktop/`: Electron. It starts the packaged backend on a random local port and serves the built frontend.
- Follow the existing structure and patterns unless there is a clear reason to improve them, and say why when you do.

## Documentation

- Keep the documentation accurate to what is actually implemented, not what was intended. Update `README.md` for every user-visible feature or architecture change.
- `docs/` is local and gitignored: add a dated entry to `docs/worklog.md` and tick off `docs/checklist.md` for each piece of work, and keep `docs/spotify-feature-research-2026-10-03.md` and `docs/spotify-feature-audit.md` in step with Music features.

## Testing

Run from `frontend` unless stated:

- `npx eslint .` and `npm run build`: no warnings or errors.
- `npm run test:unit`: queue, routing, lyrics and recommendation logic.
- `npm run test:e2e`: Playwright with mocked APIs. Set `PW_CHANNEL=msedge` (or `chrome`) to use an installed browser. Add or update tests for new behaviour.
- `desktop`: `npm.cmd test` checks the real backend, including the settings API. It needs `backend/.venv` (run `backend\setup.cmd` once).
- Test the **web app** with the real backend too (`Start MusicBox.bat`, or uvicorn on port 8000 plus `npm run dev`) and use `http://localhost:5173`; Vite listens on `localhost` only.

Before finishing, check that nothing existing broke, test both web and desktop where relevant, and look for inconsistencies the change introduced.

## Desktop Build and Installation

After every update:

1. Bump the version in `desktop` with `npm.cmd version <x.y.z> --no-git-tag-version`.
2. Build with `npm.cmd run dist`. If electron-builder fails with `EPERM` renaming `dist\win-unpacked.tmp`, set `MUSICBOX_DIST_DIR` to a folder outside the synced Documents folder and copy the installer into `desktop\dist` afterwards.
3. Smoke-test the packaged app with `MusicBox.exe --smoke-test`. Set `MUSICBOX_SMOKE_VIDEO_ID=<id>` to check playback, `MUSICBOX_SMOKE_MUSIC=1` to check the Music experience and `MUSICBOX_SMOKE_SCREENSHOT=<file.png>` to save a screenshot.
4. Install the new build (`MusicBox Setup <version>.exe /S` installs silently) and verify the change in the **installed** app. A working development build does not prove the installed build works.

Shells started from VS Code inherit `ELECTRON_RUN_AS_NODE`, which makes Electron behave like Node. Unset it before starting Electron or the installed app from a script.

## Git

- Use Conventional Commits, as in the existing history: `feat(music): …`, `fix(desktop): …`, `chore(desktop): release 0.3.0`, `docs: …`. The summary line is imperative and under about 72 characters; the body explains what changed and why.
- Do not add `Co-authored-by` or other AI attribution lines.
- Commit or push only when asked.
