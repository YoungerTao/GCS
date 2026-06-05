@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0\.."

set "WINDOWS_DIR=%CD%\windows"
set "LOG_DIR=%WINDOWS_DIR%\logs"
set "PYTHON_INSTALLER=%TEMP%\python-3.11.9-amd64.exe"
set "PYTHON_URL=https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_STAMP=%DATE:~0,4%%DATE:~5,2%%DATE:~8,2%-%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
set "LOG_STAMP=%LOG_STAMP: =0%"
set "LOG_FILE=%LOG_DIR%\install-%LOG_STAMP%.log"
set "GCS_INSTALL_LOG=%LOG_FILE%"

echo.>"%LOG_FILE%"
call :log Installer started

echo.
echo GCS Windows one-click installer
echo.
echo Log file: %LOG_FILE%

echo.
echo [0/4] Stopping any stale GCS background services (important after git updates)...
call :log Running stop-gcs-services.ps1 (early, no Python required)
powershell -NoProfile -ExecutionPolicy Bypass -File "%WINDOWS_DIR%\tools\stop-gcs-services.ps1" >> "%LOG_FILE%" 2>&1
python "%CD%\tools\gcs-stop.py" --force >> "%LOG_FILE%" 2>&1

call :ensure_python
if errorlevel 1 goto :fail

echo.
echo [2/4] Preparing Python environment...
call :log Running setup-python-deps.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%WINDOWS_DIR%\tools\setup-python-deps.ps1" >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :fail

echo.
echo [3/4] Creating shortcuts...
call :log Running install-gcs-desktop.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%WINDOWS_DIR%\tools\install-gcs-desktop.ps1" -WatchdogStartup >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :fail

echo.
echo [4/4] Running final checks...
call :log Running check-windows-env.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%WINDOWS_DIR%\tools\check-windows-env.ps1" >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :fail

echo.
echo Install complete.
echo You should now have a Desktop GCS shortcut.
call :log Install completed successfully
pause
exit /b 0

:ensure_python
echo [1/4] Checking Python...
call :log Checking Python
set "PYTHON_CMD="
set "PYTHON_EXE="

if exist "%LocalAppData%\Programs\Python\Python311\python.exe" (
  set "PYTHON_EXE=%LocalAppData%\Programs\Python\Python311\python.exe"
  set "PYTHON_CMD=%LocalAppData%\Programs\Python\Python311\python.exe"
)

if not defined PYTHON_CMD (
  for %%I in (py python python3) do (
    where /q %%I
    if !errorlevel! equ 0 (
      for /f "usebackq delims=" %%P in (`%%I -c "import sys; print(sys.executable)" 2^>nul`) do (
        set "PYTHON_EXE=%%P"
        set "PYTHON_CMD=%%I"
        goto :python_candidate_found
      )
    )
  )
)

:python_candidate_found
if defined PYTHON_EXE (
  call :log Found Python candidate: %PYTHON_EXE%
  echo %PYTHON_EXE% | find /I "WindowsApps" >nul && set "PYTHON_CMD="
  echo %PYTHON_EXE% | find /I "PythonSoftwareFoundation" >nul && set "PYTHON_CMD="
)

if defined PYTHON_CMD (
  call :validate_python "%PYTHON_CMD%"
  if not errorlevel 1 (
    echo   Python is usable.
    call :log Using Python: %PYTHON_CMD%
    exit /b 0
  )
)

echo   Installing official Python 3.11...
call :log Installing official Python 3.11

if not exist "%PYTHON_INSTALLER%" (
  echo   Downloading installer...
  call :log Downloading installer from %PYTHON_URL%
  powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%PYTHON_INSTALLER%'" >> "%LOG_FILE%" 2>&1
  if errorlevel 1 (
    call :log Python download failed
    echo   Python download failed.
    exit /b 1
  )
)

echo   Running silent installer...
"%PYTHON_INSTALLER%" /quiet InstallAllUsers=0 PrependPath=1 Include_launcher=1 Include_pip=1 Include_test=0 SimpleInstall=1 >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
  call :log Python installer failed
  echo   Python installer failed.
  exit /b 1
)

set "PATH=%LocalAppData%\Programs\Python\Python311\;%LocalAppData%\Programs\Python\Python311\Scripts\;%PATH%"
set "PYTHON_CMD=%LocalAppData%\Programs\Python\Python311\python.exe"

if not exist "%PYTHON_CMD%" (
  call :log Python verification failed after install
  echo   Python verification failed after install.
  exit /b 1
)

call :validate_python "%PYTHON_CMD%"
if errorlevel 1 (
  call :log Python validation failed after install
  echo   Python validation failed after install.
  exit /b 1
)

echo   Python installed successfully.
call :log Python installed successfully
exit /b 0

:validate_python
%~1 -c "import sys; exit(0 if sys.version_info >= (3,8) else 1)" >nul 2>&1
exit /b %errorlevel%

:log
>>"%LOG_FILE%" echo [%date% %time%] %*
exit /b 0

:fail
echo.
echo Install failed.
echo See log: %LOG_FILE%
call :log Install failed
pause
exit /b 1
