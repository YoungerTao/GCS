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
# Probe the *actual* python that -3 or bare “python” will run (py launcher may redirect)
$probeExe = (& $bootstrap.Exe @($bootstrap.Args) -c “import sys; print(sys.executable)” 2>$null).Trim()
if (-not $probeExe) { $probeExe = $bootstrap.Exe }
if (Test-IsBadMicrosoftStorePython $probeExe) {
    throw “检测到 Microsoft Store 版 Python（路径含 WindowsApps / PythonSoftwareFoundation）：`n$probeExe`n`n该版本受 Windows 沙箱限制，无法访问 E: 等项目目录文件，也无法稳定读写串口 COM 设备。`n会导致 apm-param-db.json 加载失败、DroneCAN 节点参数 Load/Refresh 报 WriteFile PermissionError(13, '设备不识别此命令')。`n`n请卸载 Microsoft Store Python，或在 PATH 前优先使用官方版。推荐从 https://www.python.org/downloads/ 下载 Windows installer，安装时勾选 “Add python.exe to PATH”。安装后删除本目录下的 .venv 文件夹（如存在），然后重新运行本脚本。”
}

# Check Python version
$pyVersion = (& $bootstrap.Exe @($bootstrap.Args) -c “import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')” 2>$null).Trim()
if (-not $pyVersion) {
    throw “无法检查 Python 版本。”
}
$majorMinor = $pyVersion -split '\.'
if ([int]$majorMinor[0] -lt 3 -or ([int]$majorMinor[0] -eq 3 -and [int]$majorMinor[1] -lt 8)) {
    throw “Python 版本过低：$pyVersion。需要 Python 3.8 或更新版本。请从 https://www.python.org/downloads/ 下载升级。”
}
Write-Host “✓ Python 版本: $pyVersion”

# Check venv module availability
& $bootstrap.Exe @($bootstrap.Args) -c “import venv” >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    throw “Python 环境缺少 venv 模块。请重新安装 Python 或安装 python3-venv 包。”
}
Write-Host “✓ venv 模块可用”

if (-not (Test-Path -LiteralPath $VenvPy)) {
    Write-Host "Creating virtual environment: $VenvDir"

    # Check if path is valid (no illegal characters)
    if ($VenvDir -match '[<>:"|?*]' -or $VenvDir.Length -gt 260) {
        throw "虚拟环境路径过长或包含非法字符：$VenvDir（需要 < 260 字符，不能包含 < > : "" | ? *）。请在更简短的路径下 clone 仓库。"
    }

    & $bootstrap.Exe @($bootstrap.Args) -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create virtual environment. 可能原因：venv 模块缺失、权限不足、或磁盘空间不足。"
    }
}

if (-not (Test-Path -LiteralPath $VenvPy)) {
    throw "Virtual environment python not found: $VenvPy"
}

if (Test-IsBadMicrosoftStorePython $VenvPy) {
    throw "创建的 .venv 基于 Microsoft Store Python，仍然受限：$VenvPy`n请改用官方 Python 重新创建 venv。"
}

Write-Host "Installing GCS core dependencies (requirements.txt: pyserial + pymavlink + dronecan) into .venv ..."
Write-Host "Upgrading pip/setuptools/wheel in .venv ..."
& $VenvPy -m pip install --upgrade pip setuptools wheel
if ($LASTEXITCODE -ne 0) {
    throw "Failed to upgrade pip/setuptools/wheel in .venv."
}

# Verify pip version
$pipVersion = (& $VenvPy -m pip --version 2>$null | Select-Object -First 1).Trim()
Write-Host "✓ $pipVersion"

Write-Host "Installing requirements from $Req ..."

& $VenvPy -m pip install -r $Req
if ($LASTEXITCODE -ne 0) {
    Write-Host "提示：如果某些包（如 dronecan）编译失败，可能是缺少 C++ 编译工具。" -ForegroundColor Yellow
    Write-Host "请安装 Visual C++ Build Tools: https://visualstudio.microsoft.com/zh-hans/downloads/" -ForegroundColor Yellow
    Write-Host "选择「Desktop development with C++」，然后重新运行本脚本。" -ForegroundColor Yellow
    throw "Failed to install requirements from root requirements.txt (dronecan 等核心依赖)。"
}

& $VenvPy -c "import serial; from pymavlink import mavutil; import dronecan; print('OK: 核心依赖就绪 (pyserial, pymavlink, dronecan)')"
if ($LASTEXITCODE -ne 0) {
    Write-Host "警告：核心依赖导入失败。请检查以下几点：" -ForegroundColor Red
    Write-Host "  1. 确认已安装 Visual C++ Build Tools（某些 wheel 需要编译）" -ForegroundColor Yellow
    Write-Host "  2. 运行：$VenvPy -m pip show dronecan（验证 dronecan 是否正确安装）" -ForegroundColor Yellow
    Write-Host "  3. 查看具体错误：$VenvPy -c 'import dronecan'（获取详细错误信息）" -ForegroundColor Yellow
    throw "核心依赖安装完成，但 import 验证失败（缺少 dronecan / serial / pymavlink）。请检查 requirements.txt 内容后重试。"
}

# Double-check the venv's self-reported executable (catches venvs bootstrapped from Store python)
$reported = (& $VenvPy -c "import sys; print(sys.executable)" 2>$null).Trim()
if (Test-IsBadMicrosoftStorePython $reported) {
    throw "警告：.venv 中的 Python 实际是受限的 Microsoft Store 版本：$reported`n请删除 .venv 目录，使用官方 Python 重新执行本脚本。"
}

Write-Host "GCS Python 环境就绪（核心依赖已安装）：$VenvPy"
