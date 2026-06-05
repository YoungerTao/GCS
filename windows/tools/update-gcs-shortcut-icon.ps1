$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Launcher = Join-Path $Root "windows\GCS.cmd"
$IconIco = Join-Path $Root "assets\gcs-dog.ico"

function New-GcsShortcut {
    param([string]$ShortcutPath)
    $Wsh = New-Object -ComObject WScript.Shell
    $Sc = $Wsh.CreateShortcut($ShortcutPath)
    $Sc.TargetPath = $Launcher
    $Sc.WorkingDirectory = $Root
    $Sc.WindowStyle = 7
    $Sc.Description = "GCS"
    $Sc.IconLocation = "$IconIco,0"
    $Sc.Save()
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$Programs = [Environment]::GetFolderPath("Programs")
$StartMenuDir = Join-Path $Programs "GCS"
if (-not (Test-Path $StartMenuDir)) { New-Item -ItemType Directory -Path $StartMenuDir | Out-Null }
New-GcsShortcut (Join-Path $Desktop "GCS.lnk")
New-GcsShortcut (Join-Path $StartMenuDir "GCS.lnk")
