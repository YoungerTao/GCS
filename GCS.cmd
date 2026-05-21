@echo off

setlocal

cd /d "%~dp0"



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

    start "" "http://127.0.0.1:8766/index.html"

    exit /b 0

  )

)

echo.>"%TEMP%\gcs-launch.lock"



set "PY=pythonw"

where pythonw >nul 2>&1 || set "PY=python"

where %PY% >nul 2>&1 || goto :no_python



rem 无 cmd 黑窗：pythonw 后台启动（勿再调用 GCS.cmd _run）

powershell -NoProfile -WindowStyle Hidden -Command ^

  "Start-Process -FilePath '%PY%' -ArgumentList 'tools\gcs-launch.py' -WorkingDirectory '%CD%' -WindowStyle Hidden"

exit /b 0



:no_python

del "%TEMP%\gcs-launch.lock" 2>nul

mshta "javascript:var s=new ActiveXObject('WScript.Shell');s.Popup('未检测到 Python。\r\n请安装 Python 3（建议勾选 py launcher / pythonw）后重新打开 GCS。',0,'GCS',64);close()"

exit /b 1



