@echo off
setlocal
cd /d "%~dp0\.."

set "BOOT_URL=%CD%\boot.html"
set "PY=%CD%\.venv\Scripts\pythonw.exe"
if not exist "%PY%" set "PY=%CD%\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=pythonw"

curl -s -m 1 http://127.0.0.1:8766/__gcs/ping >nul 2>&1
if not errorlevel 1 (
  start "" "http://127.0.0.1:8766/index.html"
  exit /b 0
)

echo.>"%TEMP%\gcs-launch.lock"
start "" "%BOOT_URL%"

if /I "%PY%"=="pythonw" (
  where pythonw >nul 2>&1 || set "PY=python"
)
if /I "%PY%"=="python" (
  where python >nul 2>&1 || goto :no_python
)
if /I not "%PY%"=="python" if /I not "%PY%"=="pythonw" if not exist "%PY%" goto :no_python

curl -s -m 1 http://127.0.0.1:8767/ping >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%PY%' -ArgumentList 'tools\gcs_watchdog.py','--prewarm-runtime' -WorkingDirectory '%CD%' -WindowStyle Hidden"
)

exit /b 0

:no_python
del "%TEMP%\gcs-launch.lock" 2>nul
mshta "javascript:var s=new ActiveXObject('WScript.Shell');s.Popup('Python not found. Re-run windows\\GCS-智能安装.bat.',0,'GCS',64);close()"
exit /b 1
