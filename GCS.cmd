@echo off
setlocal
cd /d "%~dp0"

rem Re-launch minimized so double-click does not flash a console window.
if /i not "%~1"=="_run" (
  start "" /min cmd /c "%~f0" _run
  exit /b 0
)

set "PY=pythonw"
where pythonw >nul 2>&1 || set "PY=python"
where %PY% >nul 2>&1 || goto :no_python

curl -s -m 2 http://127.0.0.1:8767/ping >nul 2>&1
if errorlevel 1 (
  start "" /min "%PY%" tools\gcs_watchdog.py
  timeout /t 2 /nobreak >nul
)

powershell -NoProfile -WindowStyle Hidden -Command ^
  "try { Invoke-RestMethod -Uri 'http://127.0.0.1:8767/launch' -Method POST -TimeoutSec 45 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 goto :launch_failed

start "" "http://127.0.0.1:8766/index.html"
exit /b 0

:no_python
mshta "javascript:var s=new ActiveXObject('WScript.Shell');s.Popup('未检测到 Python。\r\n请安装 Python 3 后重新打开 GCS，或联系技术支持。',0,'GCS',64);close()"
exit /b 1

:launch_failed
mshta "javascript:var s=new ActiveXObject('WScript.Shell');s.Popup('GCS 启动失败。\r\n请从桌面「GCS」图标重试，或确认已安装 Python 3。',0,'GCS',48);close()"
exit /b 1
