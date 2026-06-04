@echo off
rem Developer helper (visible errors). Customers use desktop GCS / GCS.cmd (no console).
setlocal
cd /d "%~dp0"
chcp 65001 >nul 2>&1
rem NOTE: For full end-user experience always prefer the GCS-安装桌面快捷方式.bat flow (it sets up .venv + requirements.txt including dronecan).

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
  echo.
  echo IMPORTANT: Do NOT use Microsoft Store Python (paths containing WindowsApps or PythonSoftwareFoundation).
  echo It is sandboxed and will cause "WriteFile failed PermissionError" for DroneCAN and "未加载 apm-param-db.json".
  echo Download official installer from https://www.python.org/downloads/ , check "Add to PATH".
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
