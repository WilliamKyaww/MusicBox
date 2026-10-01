"""Local backend entry point used by the MusicBox desktop application."""

import argparse
import asyncio
import json
import os
from pathlib import Path
import secrets
import socket

from dotenv import load_dotenv


def create_desktop_app(frontend_dir: Path, token: str):
    from fastapi.responses import JSONResponse
    from fastapi.staticfiles import StaticFiles
    from app.main import app

    @app.middleware("http")
    async def desktop_auth(request, call_next):
        supplied = request.headers.get("X-MusicBox-Desktop", "")
        if not secrets.compare_digest(supplied, token):
            return JSONResponse({"detail": "Desktop session required."}, status_code=401)
        return await call_next(request)

    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="desktop-ui")
    return app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frontend-dir", type=Path, required=True)
    parser.add_argument("--config-file", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--tools-dir", type=Path)
    args = parser.parse_args()
    token = os.environ.get("MUSICBOX_DESKTOP_TOKEN", "")
    if len(token) < 32:
        raise RuntimeError("Missing desktop session token.")
    load_dotenv(args.config_file, override=True)
    # Managed paths and session credentials take precedence over user settings.
    os.environ["MUSICBOX_DESKTOP_TOKEN"] = token
    os.environ["MUSICBOX_AUTH_USERNAME"] = ""
    os.environ["MUSICBOX_AUTH_PASSWORD"] = ""
    for setting, directory in (
        ("DOWNLOADS_DIR", "downloads"),
        ("PLAYLISTS_DIR", "playlists"),
        ("EXPORTS_DIR", "exports"),
        ("DISCORD_THUMBNAILS_DIR", "discord-thumbnails"),
    ):
        os.environ[setting] = str(args.data_dir.resolve() / directory)
    if args.tools_dir:
        tool_dir = args.tools_dir.resolve()
        os.environ["PATH"] = str(tool_dir) + os.pathsep + os.environ.get("PATH", "")
        os.environ["FFMPEG_BINARY"] = str(tool_dir / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg"))

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(128)
        sock.setblocking(False)
        port = sock.getsockname()[1]
        os.environ["FRONTEND_ORIGIN"] = f"http://127.0.0.1:{port}"
        import uvicorn
        app = create_desktop_app(args.frontend_dir.resolve(), token)
        server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", log_level="info", loop="asyncio"))

        # Register before the static mount, which otherwise consumes all URL paths.
        async def shutdown():
            server.should_exit = True
            return {"status": "stopping"}

        from fastapi.routing import APIRoute
        app.router.routes.insert(0, APIRoute("/api/desktop/shutdown", shutdown, methods=["POST"]))

        async def run():
            try:
                await server.serve(sockets=[sock])
            finally:
                from app.services.discord_presence import get_discord_presence_manager
                try:
                    await asyncio.wait_for(get_discord_presence_manager().clear_activity(), timeout=2)
                except Exception:
                    pass

        print(json.dumps({"event": "musicbox-ready", "port": port}), flush=True)
        asyncio.run(run())


if __name__ == "__main__":
    main()
