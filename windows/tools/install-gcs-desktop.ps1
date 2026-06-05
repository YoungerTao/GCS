param([switch]$WatchdogStartup)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Launcher = Join-Path $Root "windows\GCS.cmd"
$PrewarmLauncher = Join-Path $Root "windows\GCS-Prewarm.cmd"
$IconIco = Join-Path $Root "assets\gcs-dog.ico"
$LogFile = $env:GCS_INSTALL_LOG

function Write-InstallLog {
    param([string]$Message)
    if ($LogFile) {
        try {
            Add-Content -LiteralPath $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -ErrorAction Stop
        } catch {
            # The parent installer may already hold the log file open via shell redirection.
        }
    }
}

function New-GcsShortcut {
    param([string]$ShortcutPath, [string]$TargetPath)
    $dir = Split-Path -Parent $ShortcutPath
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
    $Wsh = New-Object -ComObject WScript.Shell
    $Sc = $Wsh.CreateShortcut($ShortcutPath)
    $Sc.TargetPath = $TargetPath
    $Sc.WorkingDirectory = $Root
    $Sc.WindowStyle = 7
    $Sc.Description = "GCS"
    if (Test-Path -LiteralPath $IconIco) { $Sc.IconLocation = "$IconIco,0" }
    $Sc.Save()
}

function Remove-GcsShortcutsByPattern {
    param([string]$DirectoryPath)
    if (-not (Test-Path -LiteralPath $DirectoryPath)) {
        return
    }
    Get-ChildItem -LiteralPath $DirectoryPath -Filter "GCS*.lnk" -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$Programs = [Environment]::GetFolderPath("Programs")
$StartMenuDir = Join-Path $Programs "GCS"
if (-not (Test-Path $StartMenuDir)) { New-Item -ItemType Directory -Path $StartMenuDir | Out-Null }

$desktopShortcut = Join-Path $Desktop "GCS.lnk"
$startShortcut = Join-Path $StartMenuDir "GCS.lnk"
Remove-GcsShortcutsByPattern $Desktop
Remove-GcsShortcutsByPattern $StartMenuDir
New-GcsShortcut $desktopShortcut $Launcher
New-GcsShortcut $startShortcut $Launcher
Write-Host "Desktop shortcut: $desktopShortcut"
Write-Host "Start menu shortcut: $startShortcut"
Write-InstallLog "Desktop shortcut: $desktopShortcut"
Write-InstallLog "Start menu shortcut: $startShortcut"

if ($WatchdogStartup) {
    $Startup = [Environment]::GetFolderPath("Startup")
    $startupShortcut = Join-Path $Startup "GCS Watchdog.lnk"
    if (Test-Path -LiteralPath $startupShortcut) {
        Remove-Item -LiteralPath $startupShortcut -Force -ErrorAction SilentlyContinue
    }
    New-GcsShortcut $startupShortcut $PrewarmLauncher
    Write-Host "Startup shortcut: $startupShortcut"
    Write-InstallLog "Startup shortcut: $startupShortcut"
}
