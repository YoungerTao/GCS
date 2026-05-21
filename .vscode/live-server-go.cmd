@echo off
rem Live Server (Windows): Go Live -> Chrome + GCS stack
cd /d "%~dp0\.."
py -3 "%~dp0live-server-open.py" --chrome %* 2>nul || python "%~dp0live-server-open.py" --chrome %*
