@echo off
setlocal
cd /d "%~dp0"

set "PY=%CD%\.venv\Scripts\pythonw.exe"
if not exist "%PY%" set "PY=%CD%\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=pythonw"
where pythonw >nul 2>&1 || if /I "%PY%"=="pythonw" set "PY=python"
if /I "%PY%"=="python" where python >nul 2>&1 || exit /b 1
if /I not "%PY%"=="python" if /I not "%PY%"=="pythonw" if not exist "%PY%" exit /b 1

powershell -NoProfile -WindowStyle Hidden -Command ^
  "Start-Process -FilePath '%PY%' -ArgumentList 'tools\gcs_watchdog.py','--prewarm-runtime' -WorkingDirectory '%CD%' -WindowStyle Hidden"

exit /b 0
