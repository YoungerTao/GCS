@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install-gcs-desktop.ps1"
if errorlevel 1 (
  echo.
  echo 安装 GCS 桌面快捷方式失败。
  echo 请确认已允许 PowerShell 脚本运行，并重试。
  pause
  exit /b 1
)

echo.
echo 安装完成。
echo 现在可以直接双击桌面的 GCS 快捷方式启动。
pause
