@echo off
title MusicBox Desktop
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
