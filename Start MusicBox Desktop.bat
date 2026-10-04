@echo off
title MusicBox Desktop
rem Running from source uses the backend in backend\.venv, so set that up first.
call "%~dp0backend\setup.cmd"
if errorlevel 1 goto failed
cd /d "%~dp0desktop"
if not exist "node_modules\electron\dist\electron.exe" (
    echo Installing MusicBox desktop dependencies...
    call npm.cmd ci
    if errorlevel 1 goto failed
)
call npm.cmd start
if errorlevel 1 goto failed
exit /b 0
:failed
echo MusicBox could not start. See the error above.
pause
exit /b 1
