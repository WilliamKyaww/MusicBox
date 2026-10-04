@echo off
rem Prepares the MusicBox backend: creates backend\.venv on first run and
rem reinstalls packages whenever requirements.txt changes. Safe to run often.
setlocal
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" goto packages

echo Setting up the MusicBox backend for the first time...
set "PYTHON_CMD="
where py >nul 2>nul && set "PYTHON_CMD=py -3"
if not defined PYTHON_CMD where python >nul 2>nul && set "PYTHON_CMD=python"
if not defined PYTHON_CMD goto no_python
%PYTHON_CMD% -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>nul
if errorlevel 1 goto old_python
%PYTHON_CMD% -m venv .venv
if errorlevel 1 (
    echo Could not create the Python environment in backend\.venv.
    exit /b 1
)

:packages
rem A copy of the last installed requirements.txt marks the environment as current.
fc /b "requirements.txt" ".venv\musicbox-requirements.txt" >nul 2>nul && exit /b 0
echo Installing backend packages. This can take a minute...
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements.txt
if errorlevel 1 (
    echo Installing the backend packages failed. Check your internet connection and try again.
    exit /b 1
)
copy /y "requirements.txt" ".venv\musicbox-requirements.txt" >nul
exit /b 0

:no_python
echo MusicBox needs Python 3.11 or newer. Install it from https://www.python.org/downloads/
echo and tick "Add python.exe to PATH", then run this again.
exit /b 1

:old_python
echo MusicBox needs Python 3.11 or newer. Install it from https://www.python.org/downloads/
echo then run this again.
exit /b 1
