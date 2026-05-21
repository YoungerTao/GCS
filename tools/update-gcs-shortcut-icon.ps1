# Refresh desktop / start menu GCS shortcuts with dog icon (no Chinese strings).
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Launcher = Join-Path $Root "GCS.cmd"
$IconIco = Join-Path $Root "assets\gcs-dog.ico"
if (-not (Test-Path -LiteralPath $Launcher)) {
    throw "GCS.cmd not found: $Launcher"
}
if (-not (Test-Path -LiteralPath $IconIco)) {
    throw "Icon not found. Run: python tools\build-gcs-icon.py"
}

function New-GcsShortcut {
    param([string]$ShortcutPath)
    $dir = Split-Path -Parent $ShortcutPath
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
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

New-GcsShortcut (Join-Path $Desktop "GCS.lnk")
New-GcsShortcut (Join-Path $StartMenuDir "GCS.lnk")

Write-Host "Shortcuts updated with dog icon: $IconIco"
