@echo off
rem One-click launcher: sets MusicBox up on first run, starts the backend and
rem frontend, then opens the web app.
title MusicBox Launcher
cd /d "%~dp0"

call "%~dp0backend\setup.cmd"
if errorlevel 1 (
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    pushd frontend
    call npm install
    popd
)

rem Port 5173 is Vite's default, so another project's dev server may already hold it.
rem Exit codes: 0 = free, 1 = MusicBox is already running, 2 = taken by something else.
set "MUSICBOX_FRONTEND=%~dp0frontend"
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $c) { exit 0 }; $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $c.OwningProcess); if ($p.CommandLine -and $p.CommandLine.IndexOf($env:MUSICBOX_FRONTEND, [StringComparison]::OrdinalIgnoreCase) -ge 0) { exit 1 }; Write-Host 'Port 5173 is in use by another program, so MusicBox cannot start:'; Write-Host ('  PID ' + $c.OwningProcess + ': ' + $p.CommandLine); Write-Host ('Close it, or run: taskkill /F /PID ' + $c.OwningProcess); exit 2"
if errorlevel 2 (
    pause
    exit /b 1
)
if errorlevel 1 goto open

start "MusicBox Backend" /min /d "%~dp0backend" cmd /k .venv\Scripts\python -m uvicorn app.main:app --reload
start "MusicBox Frontend" /min /d "%~dp0frontend" cmd /k npm run dev

echo Waiting for MusicBox to start...
rem Checking health through the frontend's proxy only passes once both halves are up.
powershell -NoProfile -Command "$deadline = (Get-Date).AddSeconds(90); while ((Get-Date) -lt $deadline) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:5173/api/health | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 (
    echo MusicBox did not start within 90 seconds. Check the minimised MusicBox windows for errors.
    pause
    exit /b 1
)

:open
start "" http://localhost:5173
exit
