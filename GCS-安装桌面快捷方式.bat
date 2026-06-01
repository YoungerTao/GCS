@echo off
setlocal
cd /d "%~dp0"

echo Preparing Python bridge environment...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\setup-python-deps.ps1"
if errorlevel 1 (
  echo.
  echo GCS Python bridge dependencies install failed.
  echo Please install Python 3 first, then run this installer again.
  pause
  exit /b 1
)

echo.
echo Creating desktop shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install-gcs-desktop.ps1"
if errorlevel 1 (
  echo.
  echo Install GCS desktop shortcut failed.
  echo Please confirm PowerShell script execution is allowed, then try again.
  pause
  exit /b 1
)

echo.
echo Install complete.
echo You can now double-click the desktop GCS shortcut to launch.
pause
