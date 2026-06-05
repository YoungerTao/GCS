$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$PrewarmLauncher = Join-Path $Root "windows\GCS-Prewarm.cmd"
$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "GCS Watchdog.lnk"

$Wsh = New-Object -ComObject WScript.Shell
$Sc = $Wsh.CreateShortcut($ShortcutPath)
$Sc.TargetPath = $PrewarmLauncher
$Sc.WorkingDirectory = $Root
$Sc.WindowStyle = 7
$Sc.Description = "GCS launcher watchdog + runtime prewarm"
$Sc.Save()
