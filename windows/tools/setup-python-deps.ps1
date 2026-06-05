$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Req = Join-Path $Root "requirements.txt"
$VenvDir = Join-Path $Root ".venv"
$VenvPy = Join-Path $VenvDir "Scripts\python.exe"
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

function Get-BootstrapPython {
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

function Test-VenvHealthy {
    if (-not (Test-Path -LiteralPath $VenvPy)) {
        return $false
    }
    & $VenvPy -c "import sys; print(sys.executable)" > $null 2>&1
    return ($LASTEXITCODE -eq 0)
}

if (-not (Test-Path -LiteralPath $Req)) {
    throw "requirements.txt not found: $Req"
}

$bootstrap = Get-BootstrapPython
$bootstrapExe = (& $bootstrap -c "import sys; print(sys.executable)" 2>$null).Trim()
if ($bootstrapExe -match "WindowsApps|PythonSoftwareFoundation") {
    throw "Detected Microsoft Store Python. Please rerun the smart installer."
}

if ((Test-Path -LiteralPath $VenvDir) -and -not (Test-VenvHealthy)) {
    Write-Host "Existing virtual environment is broken. Recreating..."
    Write-InstallLog "Existing virtual environment is broken. Recreating."
    Remove-Item -LiteralPath $VenvDir -Recurse -Force
}

if (Test-Path -LiteralPath $VenvDir) {
    Write-Host "Using existing virtual environment: $VenvDir"
    Write-InstallLog "Using existing virtual environment: $VenvDir"
} else {
    Write-Host "Creating virtual environment: $VenvDir"
    Write-InstallLog "Creating virtual environment: $VenvDir"
    & $bootstrap -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create virtual environment."
    }
}

if (-not (Test-Path -LiteralPath $VenvPy)) {
    throw "Virtual environment python not found: $VenvPy"
}

Write-Host "Upgrading pip/setuptools/wheel..."
Write-InstallLog "Upgrading pip/setuptools/wheel."
& $VenvPy -m pip install --upgrade pip setuptools wheel
if ($LASTEXITCODE -ne 0) {
    throw "Failed to upgrade pip/setuptools/wheel."
}

Write-Host "Installing core dependencies from requirements.txt..."
Write-InstallLog "Installing core dependencies from requirements.txt."
& $VenvPy -m pip install -r $Req
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install requirements.txt"
}

Write-Host "Verifying runtime modules..."
Write-InstallLog "Verifying runtime modules."
& $VenvPy -c "import serial; from pymavlink import mavutil; import dronecan; print('OK')"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Verification failed. Recreating virtual environment..."
    Write-InstallLog "Verification failed. Recreating virtual environment."
    Remove-Item -LiteralPath $VenvDir -Recurse -Force
    & $bootstrap -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) {
        throw "Runtime dependency verification failed and venv recreation failed."
    }
    & $VenvPy -m pip install --upgrade pip setuptools wheel
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to upgrade pip/setuptools/wheel after recreating venv."
    }
    & $VenvPy -m pip install -r $Req
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install requirements.txt after recreating venv."
    }
    & $VenvPy -c "import serial; from pymavlink import mavutil; import dronecan; print('OK')"
    if ($LASTEXITCODE -ne 0) {
        throw "Runtime dependency verification failed after recreating venv."
    }
}

Write-Host "GCS Python environment is ready."
Write-InstallLog "GCS Python environment is ready."
