@echo off

setlocal

cd /d "%~dp0"
chcp 65001 >nul 2>&1

set "BOOT_URL=%CD%\boot.html"



rem 已在运行：只打开浏览器

curl -s -m 2 http://127.0.0.1:8766/__gcs/ping >nul 2>&1

if not errorlevel 1 (

  start "" "http://127.0.0.1:8766/index.html"

  exit /b 0

)



rem 防止连点桌面图标叠多个启动窗

if exist "%TEMP%\gcs-launch.lock" (

  curl -s -m 1 http://127.0.0.1:8767/ping >nul 2>&1

  if not errorlevel 1 (

    start "" "%BOOT_URL%"

    exit /b 0

  )

)

echo.>"%TEMP%\gcs-launch.lock"

start "" "%BOOT_URL%"



set "PY=%CD%\.venv\Scripts\pythonw.exe"
if not exist "%PY%" set "PY=%CD%\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=pythonw"
where pythonw >nul 2>&1 || if /I "%PY%"=="pythonw" set "PY=python"
if /I "%PY%"=="python" where python >nul 2>&1 || goto :no_python
if /I not "%PY%"=="python" if /I not "%PY%"=="pythonw" if not exist "%PY%" goto :no_python


rem === 关键依赖检查（git clone 后最常见问题：未运行安装 bat 导致 dronecan 缺失 或 Store Python 引起 WriteFile PermissionError）===
rem 使用非 pythonw 版本执行检查，确保错误信息可见
set "PYCHECK=%PY%"
if /I "%PYCHECK%"=="pythonw" set "PYCHECK=python"
"%PYCHECK%" -c "import dronecan, serial, pymavlink" >nul 2>&1
if errorlevel 1 (
  echo.
  echo [错误] 缺少 DroneCAN / 串口桥核心 Python 依赖（dronecan / pyserial / pymavlink）。
  echo.
  echo 原因通常是：
  echo   - git clone 后直接双击 GCS.cmd 或桌面快捷，而未先运行 "GCS-安装桌面快捷方式.bat"。
  echo   - .venv 不完整（缺少 requirements.txt 中的 dronecan）。
  echo   - 使用了 Microsoft Store 版 Python（沙箱限制，会导致文件/串口权限错误）。
  echo.
  echo 请执行以下操作后重试：
  echo   1. 双击仓库根目录的 "GCS-安装桌面快捷方式.bat"（会自动创建 .venv + pip install -r requirements.txt + 创建桌面快捷）。
  echo   2. 安装成功后，再双击桌面 "GCS" 图标 或 本 GCS.cmd 启动。
  echo.
  echo 提示：安装脚本会自动检测并拒绝 Store Python，并给出官方 python.org 下载指引。
  echo.
  del "%TEMP%\gcs-launch.lock" 2>nul
  pause
  exit /b 1
)


rem 无 cmd 黑窗：pythonw 后台启动（勿再调用 GCS.cmd _run）

powershell -NoProfile -WindowStyle Hidden -Command ^

  "Start-Process -FilePath '%PY%' -ArgumentList 'tools\gcs-launch.py','--boot-page' -WorkingDirectory '%CD%' -WindowStyle Hidden"

exit /b 0



:no_python

del "%TEMP%\gcs-launch.lock" 2>nul

mshta "javascript:var s=new ActiveXObject('WScript.Shell');s.Popup('未检测到 Python。\r\n\r\n常见问题：不要使用 Microsoft Store 版 Python（路径含 WindowsApps），它沙箱限制会导致无法读 JS/data/*.json 和串口 WriteFile 失败。\r\n请从 https://www.python.org/downloads/ 下载官方安装器，安装时勾选 Add to PATH 和 py launcher，然后重试。',0,'GCS',64);close()"

exit /b 1



