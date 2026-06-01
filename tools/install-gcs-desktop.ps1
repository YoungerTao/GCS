# Install customer shortcuts: Desktop + Start Menu "GCS" -> GCS.cmd at repo root.
# Optional watchdog at login (fast cold start): -WatchdogStartup
param(
    [switch]$WatchdogStartup
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Launcher = Join-Path $Root "GCS.cmd"
if (-not (Test-Path -LiteralPath $Launcher)) {
    throw "GCS.cmd not found at repo root: $Launcher"
}

$IconIco = Join-Path $Root "assets\gcs-dog.ico"

function New-GcsShortcut {
    param([string]$ShortcutPath)
    $Wsh = New-Object -ComObject WScript.Shell
    $Sc = $Wsh.CreateShortcut($ShortcutPath)
    $Sc.TargetPath = $Launcher
    $Sc.WorkingDirectory = $Root
    $Sc.WindowStyle = 7
    $Sc.Description = "GCS"
    if (Test-Path -LiteralPath $IconIco) {
        $Sc.IconLocation = "$IconIco,0"
    }
    $Sc.Save()
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$Programs = [Environment]::GetFolderPath("Programs")
$StartMenuDir = Join-Path $Programs "GCS"
if (-not (Test-Path $StartMenuDir)) {
    New-Item -ItemType Directory -Path $StartMenuDir | Out-Null
}

New-GcsShortcut (Join-Path $Desktop "GCS.lnk")
New-GcsShortcut (Join-Path $StartMenuDir "GCS.lnk")

Write-Host "Desktop and Start Menu shortcut created: GCS -> $Launcher"
Write-Host "Daily use: double-click the desktop GCS icon."

$ie4u = Join-Path $env:SystemRoot "System32\ie4uinit.exe"
if (Test-Path -LiteralPath $ie4u) {
    Start-Process -FilePath $ie4u -ArgumentList "-show" -Wait -NoNewWindow -ErrorAction SilentlyContinue | Out-Null
}

if ($WatchdogStartup) {
    $Watchdog = Join-Path $Root "tools\gcs_watchdog.py"
    $PyCmd = Get-Command pythonw -ErrorAction SilentlyContinue
    if (-not $PyCmd) {
        throw "pythonw not found. Install Python 3 (with pythonw) before enabling -WatchdogStartup."
    }
    $Py = $PyCmd.Source

    $Startup = [Environment]::GetFolderPath("Startup")
    $WdScPath = Join-Path $Startup "GCS Watchdog.lnk"
    $Wsh = New-Object -ComObject WScript.Shell
    $Sc = $Wsh.CreateShortcut($WdScPath)
    $Sc.TargetPath = $Py
    $Sc.Arguments = "`"$Watchdog`""
    $Sc.WorkingDirectory = $Root
    $Sc.WindowStyle = 7
    $Sc.Description = "GCS launcher watchdog (port 8767)"
    $Sc.Save()
    Write-Host "Watchdog startup shortcut installed: $WdScPath"
} else {
    Write-Host ""
    Write-Host "Optional faster cold start (watchdog only at login):"
    Write-Host "  powershell -ExecutionPolicy Bypass -File tools\install-gcs-desktop.ps1 -WatchdogStartup"
}
