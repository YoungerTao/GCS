$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Req = Join-Path $Root "requirements.txt"
$VenvPy = Join-Path $Root ".venv\Scripts\python.exe"
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

function Get-PythonCommand {
    $preferred = @(
        (Join-Path $env:LocalAppData "Programs\Python\Python311\python.exe"),
        "C:\Program Files\Python311\python.exe"
    )
    foreach ($candidate in $preferred) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    foreach ($name in @("py", "python", "python3")) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) {
            $resolved = (& $cmd.Source -c "import sys; print(sys.executable)" 2>$null).Trim()
            if ($resolved -and $resolved -notmatch "WindowsApps|PythonSoftwareFoundation") {
                return $cmd.Source
            }
        }
    }
    throw "Python not found."
}

$py = Get-PythonCommand
$exe = & $py -c "import sys; print(sys.executable)" 2>$null
if ($exe -match "WindowsApps|PythonSoftwareFoundation") {
    throw "Microsoft Store Python detected."
}

& $py -c "import sys; exit(0 if sys.version_info >= (3,8) else 1)" 2>$null
if ($LASTEXITCODE -ne 0) { throw "Python 3.8+ required." }
if (-not (Test-Path -LiteralPath $Req)) { throw "requirements.txt not found." }
if (-not (Test-Path -LiteralPath $VenvPy)) { throw ".venv python not found." }

& $VenvPy -c "import serial; from pymavlink import mavutil; import dronecan" 2>$null
if ($LASTEXITCODE -ne 0) { throw "Installed venv dependencies are not healthy." }

Write-Host "Windows env OK"
Write-InstallLog "Windows env OK"
