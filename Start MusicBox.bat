@echo off
rem One-click launcher: starts the backend and frontend, then opens the web app.
title MusicBox Launcher
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
    echo Backend virtual environment not found at backend\.venv
    echo Create it and run: pip install -r backend\requirements.txt
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    pushd frontend
    call npm install
    popd
)

start "MusicBox Backend" /min /d "%~dp0backend" cmd /k .venv\Scripts\python -m uvicorn app.main:app --reload
start "MusicBox Frontend" /min /d "%~dp0frontend" cmd /k npm run dev

echo Waiting for MusicBox to start...
powershell -NoProfile -Command "$deadline = (Get-Date).AddSeconds(60); while ((Get-Date) -lt $deadline) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:5173 | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"

start "" http://localhost:5173
exit
