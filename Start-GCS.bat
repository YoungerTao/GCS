@echo off
rem Developer helper (visible errors). Customers use desktop GCS / GCS.cmd (no console).
setlocal
cd /d "%~dp0"

set "PY=%CD%\.venv\Scripts\pythonw.exe"
if not exist "%PY%" set "PY=%CD%\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=pythonw"
where pythonw >nul 2>&1 || if /I "%PY%"=="pythonw" set "PY=python"
if /I "%PY%"=="python" where python >nul 2>&1 || (
  echo Python not found.
  pause
  exit /b 1
)
if /I not "%PY%"=="python" if /I not "%PY%"=="pythonw" if not exist "%PY%" (
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
