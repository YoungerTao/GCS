@echo off
rem Developer helper (same flow as GCS.cmd). Customers use desktop "GCS" / GCS.cmd.
setlocal
cd /d "%~dp0"

set "PY=pythonw"
where pythonw >nul 2>&1 || set "PY=python"

rem Lightweight launcher (8767) — stays in background
curl -s -m 2 http://127.0.0.1:8767/ping >nul 2>&1
if errorlevel 1 (
  start "" /B "%PY%" tools\gcs_watchdog.py
  timeout /t 2 /nobreak >nul
)

rem Runtime (8766) + COM bridge (8765)
powershell -NoProfile -Command ^
  "$ErrorActionPreference='Stop';" ^
  "Invoke-RestMethod -Uri 'http://127.0.0.1:8767/launch' -Method POST -TimeoutSec 45 | Out-Null"
if errorlevel 1 (
  echo GCS failed to start. Check Python is installed.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:8766/index.html"
exit /b 0
