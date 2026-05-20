# Optional: install GCS launcher watchdog to Windows Startup (runs at login).
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Watchdog = Join-Path $Root "tools\gcs_watchdog.py"
$PyCmd = Get-Command pythonw -ErrorAction SilentlyContinue
if ($PyCmd) { $Py = $PyCmd.Source } else {
    $PyCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($PyCmd) { $Py = $PyCmd.Source }
}
if (-not $Py) {
    throw "Python not found. Install Python 3 and retry."
}

$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "GCS Watchdog.lnk"

$Wsh = New-Object -ComObject WScript.Shell
$Sc = $Wsh.CreateShortcut($ShortcutPath)
$Sc.TargetPath = $Py
$Sc.Arguments = "`"$Watchdog`""
$Sc.WorkingDirectory = $Root
$Sc.WindowStyle = 7
$Sc.Description = "GCS COM bridge launcher (port 8767)"
$Sc.Save()

Write-Host "Installed: $ShortcutPath"
Write-Host "At login the watchdog starts; open GCS via the desktop icon or GCS.cmd"
