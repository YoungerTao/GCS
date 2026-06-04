# Optional: install GCS launcher watchdog to Windows Startup (runs at login).
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$PrewarmLauncher = Join-Path $Root "GCS-Prewarm.cmd"
if (-not (Test-Path -LiteralPath $PrewarmLauncher)) {
    throw "GCS-Prewarm.cmd not found: $PrewarmLauncher"
}

$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "GCS Watchdog.lnk"
if (Test-Path -LiteralPath $ShortcutPath) {
    Remove-Item -LiteralPath $ShortcutPath -Force
}

$Wsh = New-Object -ComObject WScript.Shell
$Sc = $Wsh.CreateShortcut($ShortcutPath)
$Sc.TargetPath = $PrewarmLauncher
$Sc.Arguments = ""
$Sc.WorkingDirectory = $Root
$Sc.WindowStyle = 7
$Sc.Description = "GCS launcher watchdog + runtime prewarm"
$Sc.Save()

Write-Host "Installed: $ShortcutPath"
Write-Host "At login the watchdog starts; open GCS via the desktop icon or GCS.cmd"
