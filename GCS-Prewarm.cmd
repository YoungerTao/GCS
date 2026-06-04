@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul 2>&1

set "PY=%CD%\.venv\Scripts\pythonw.exe"
if not exist "%PY%" set "PY=%CD%\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=pythonw"
where pythonw >nul 2>&1 || if /I "%PY%"=="pythonw" set "PY=python"
if /I "%PY%"=="python" where python >nul 2>&1 || exit /b 1
if /I not "%PY%"=="python" if /I not "%PY%"=="pythonw" if not exist "%PY%" exit /b 1

rem === 关键依赖检查（与 GCS.cmd 一致，防止 clone 后直接使用 prewarm 导致 dronecan 缺失）===
set "PYCHECK=%PY%"
if /I "%PYCHECK%"=="pythonw" set "PYCHECK=python"
"%PYCHECK%" -c "import dronecan, serial, pymavlink" >nul 2>&1
if errorlevel 1 (
  echo [Prewarm] 缺少核心依赖（dronecan 等）。请先双击运行 "GCS-安装桌面快捷方式.bat" 完成安装后再试。
  exit /b 1
)

rem NOTE: if using Microsoft Store Python here, prewarm will silently do nothing useful (sandbox breaks serial/fs). Install official Python.

powershell -NoProfile -WindowStyle Hidden -Command ^
  "Start-Process -FilePath '%PY%' -ArgumentList 'tools\gcs_watchdog.py','--prewarm-runtime' -WorkingDirectory '%CD%' -WindowStyle Hidden"

exit /b 0
