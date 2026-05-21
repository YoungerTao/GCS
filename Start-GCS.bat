@echo off
rem Developer helper (visible errors). Customers use desktop GCS / GCS.cmd (no console).
setlocal
cd /d "%~dp0"

set "PY=pythonw"
where pythonw >nul 2>&1 || set "PY=python"
where %PY% >nul 2>&1 || (
  echo Python not found.
  pause
  exit /b 1
)

"%PY%" tools\gcs-launch.py
if errorlevel 1 (
  echo GCS failed to start. Check Python is installed.
  pause
  exit /b 1
)
exit /b 0
