$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Req = Join-Path $Root "tools\com-bridge\requirements.txt"
$VenvDir = Join-Path $Root ".venv"
$VenvPy = Join-Path $VenvDir "Scripts\python.exe"

function Get-BootstrapPython {
    $pyCmd = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCmd) {
        return @{ Exe = $pyCmd.Source; Args = @("-3") }
    }
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) {
        return @{ Exe = $pythonCmd.Source; Args = @() }
    }
    $python3Cmd = Get-Command python3 -ErrorAction SilentlyContinue
    if ($python3Cmd) {
        return @{ Exe = $python3Cmd.Source; Args = @() }
    }
    throw "Python 3 not found. Please install Python 3 first."
}

if (-not (Test-Path -LiteralPath $Req)) {
    throw "requirements.txt not found: $Req"
}

if (-not (Test-Path -LiteralPath $VenvPy)) {
    $bootstrap = Get-BootstrapPython
    Write-Host "Creating virtual environment: $VenvDir"
    & $bootstrap.Exe @($bootstrap.Args) -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create virtual environment."
    }
}

if (-not (Test-Path -LiteralPath $VenvPy)) {
    throw "Virtual environment python not found: $VenvPy"
}

Write-Host "Installing bridge dependencies into .venv ..."
& $VenvPy -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    throw "Failed to upgrade pip in .venv."
}

& $VenvPy -m pip install -r $Req
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install bridge requirements."
}

& $VenvPy -c "import serial; from pymavlink import mavutil; print('OK: bridge deps ready')"
if ($LASTEXITCODE -ne 0) {
    throw "Bridge dependencies installed, but import verification failed."
}

Write-Host "Python bridge environment ready: $VenvPy"
