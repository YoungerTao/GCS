$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Req = Join-Path $Root "requirements.txt"
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

function Test-IsBadMicrosoftStorePython {
    param([string]$PythonExe)
    if (-not $PythonExe) { return $false }
    $p = $PythonExe.ToLowerInvariant().Replace("/", "\")
    if ($p.Contains("windowsapps") -or $p.Contains("pythonsoftwarefoundation")) {
        return $true
    }
    return $false
}

if (-not (Test-Path -LiteralPath $Req)) {
    throw "requirements.txt not found at repo root: $Req`n请确认仓库根目录存在 requirements.txt（包含 dronecan / pyserial / pymavlink）。"
}

$bootstrap = Get-BootstrapPython
# Probe the *actual* python that -3 or bare "python" will run (py launcher may redirect)
$probeExe = (& $bootstrap.Exe @($bootstrap.Args) -c "import sys; print(sys.executable)" 2>$null).Trim()
if (-not $probeExe) { $probeExe = $bootstrap.Exe }
if (Test-IsBadMicrosoftStorePython $probeExe) {
    throw "检测到 Microsoft Store 版 Python（路径含 WindowsApps / PythonSoftwareFoundation）：`n$probeExe`n`n该版本受 Windows 沙箱限制，无法访问 E: 等项目目录文件，也无法稳定读写串口 COM 设备。`n会导致 apm-param-db.json 加载失败、DroneCAN 节点参数 Load/Refresh 报 WriteFile PermissionError(13, '设备不识别此命令')。`n`n请卸载 Microsoft Store Python，或在 PATH 前优先使用官方版。推荐从 https://www.python.org/downloads/ 下载 Windows installer，安装时勾选 “Add python.exe to PATH”。安装后删除本目录下的 .venv 文件夹（如存在），然后重新运行本脚本。"
}

if (-not (Test-Path -LiteralPath $VenvPy)) {
    Write-Host "Creating virtual environment: $VenvDir"
    & $bootstrap.Exe @($bootstrap.Args) -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create virtual environment."
    }
}

if (-not (Test-Path -LiteralPath $VenvPy)) {
    throw "Virtual environment python not found: $VenvPy"
}

if (Test-IsBadMicrosoftStorePython $VenvPy) {
    throw "创建的 .venv 基于 Microsoft Store Python，仍然受限：$VenvPy`n请改用官方 Python 重新创建 venv。"
}

Write-Host "Installing GCS core dependencies (requirements.txt: pyserial + pymavlink + dronecan) into .venv ..."
& $VenvPy -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    throw "Failed to upgrade pip in .venv."
}

& $VenvPy -m pip install -r $Req
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install requirements from root requirements.txt (dronecan 等核心依赖)。"
}

& $VenvPy -c "import serial; from pymavlink import mavutil; import dronecan; print('OK: 核心依赖就绪 (pyserial, pymavlink, dronecan)')"
if ($LASTEXITCODE -ne 0) {
    throw "核心依赖安装完成，但 import 验证失败（缺少 dronecan / serial / pymavlink）。请检查 requirements.txt 内容后重试。"
}

# Double-check the venv's self-reported executable (catches venvs bootstrapped from Store python)
$reported = (& $VenvPy -c "import sys; print(sys.executable)" 2>$null).Trim()
if (Test-IsBadMicrosoftStorePython $reported) {
    throw "警告：.venv 中的 Python 实际是受限的 Microsoft Store 版本：$reported`n请删除 .venv 目录，使用官方 Python 重新执行本脚本。"
}

Write-Host "GCS Python 环境就绪（核心依赖已安装）：$VenvPy"
