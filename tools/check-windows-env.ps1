# Comprehensive Windows environment pre-flight check for GCS installation
# 用法: powershell -ExecutionPolicy Bypass -File tools/check-windows-env.ps1

$ErrorActionPreference = "Continue"
$issues = @()
$warnings = @()
$info = @()

Write-Host "================== GCS Windows 环境诊断 ==================`n" -ForegroundColor Cyan

# 1. Python 检查
Write-Host "[1/6] 检查 Python..." -ForegroundColor Yellow

$py = $null
$pythonSources = @("py -3", "python", "python3")

foreach ($cmd in $pythonSources) {
    try {
        $result = Invoke-Expression "$cmd -c 'import sys; print(sys.executable)'" 2>$null
        if ($result) {
            $py = $result.Trim()
            $version = (Invoke-Expression "$cmd --version" 2>&1).Trim()
            Write-Host "  ✓ 找到: $py ($version)" -ForegroundColor Green

            # 检查是否是 Microsoft Store Python
            if ($py -like "*WindowsApps*" -or $py -like "*PythonSoftwareFoundation*") {
                $issues += "Microsoft Store Python 检测到（沙箱限制）：$py"
                Write-Host "    ✗ 警告：这是 Microsoft Store 版本（受沙箱限制）" -ForegroundColor Red
            }
            break
        }
    } catch { }
}

if (-not $py) {
    $issues += "未找到 Python 3。请从 https://www.python.org/downloads/ 下载官方 Windows installer"
    Write-Host "  ✗ Python 未找到" -ForegroundColor Red
} else {
    # 检查版本
    $pyVer = (Invoke-Expression "$cmd -c 'import sys; print(f\"{sys.version_info.major}.{sys.version_info.minor}\")'").Trim()
    $major, $minor = $pyVer -split '\.'
    if ([int]$major -lt 3 -or ([int]$major -eq 3 -and [int]$minor -lt 8)) {
        $issues += "Python 版本过低：$pyVer（需要 3.8+）"
        Write-Host "    ✗ 版本要求：3.8+（当前：$pyVer）" -ForegroundColor Red
    } else {
        Write-Host "    ✓ 版本满足：$pyVer (≥3.8)" -ForegroundColor Green
    }
}

# 2. venv 模块检查
Write-Host "`n[2/6] 检查 venv 模块..." -ForegroundColor Yellow
if ($py) {
    try {
        Invoke-Expression "$([System.IO.Path]::GetDirectoryName($py) + '\python.exe') -c 'import venv'" 2>$null
        Write-Host "  ✓ venv 模块可用" -ForegroundColor Green
    } catch {
        $issues += "venv 模块不可用（Python 安装可能不完整）"
        Write-Host "  ✗ venv 模块缺失" -ForegroundColor Red
    }
}

# 3. pip 检查
Write-Host "`n[3/6] 检查 pip..." -ForegroundColor Yellow
if ($py) {
    try {
        $pipOutput = Invoke-Expression "$py -m pip --version" 2>&1
        Write-Host "  ✓ $pipOutput" -ForegroundColor Green
    } catch {
        $issues += "pip 不可用"
        Write-Host "  ✗ pip 检查失败" -ForegroundColor Red
    }
}

# 4. 磁盘空间检查
Write-Host "`n[4/6] 检查磁盘空间..." -ForegroundColor Yellow
$root = Split-Path -Parent $PSScriptRoot
$drive = Get-Item $root | Select-Object -ExpandProperty PSDrive
$freeSpace = $drive.Free / 1GB
Write-Host "  驱动器：$($drive.Name): 可用空间：$([Math]::Round($freeSpace, 2)) GB"
if ($freeSpace -lt 1) {
    $warnings += "磁盘可用空间小于 1 GB（建议至少 2 GB）"
    Write-Host "    ⚠ 警告：可用空间较少" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ 磁盘空间充足" -ForegroundColor Green
}

# 5. 路径合法性检查
Write-Host "`n[5/6] 检查路径合法性..." -ForegroundColor Yellow
if ($root -match '[<>:"|?*]' -or $root.Length -gt 240) {
    $issues += "仓库路径不合法：$root（含非法字符或过长）"
    Write-Host "  ✗ 路径含非法字符或过长" -ForegroundColor Red
} else {
    Write-Host "  ✓ 路径：$root" -ForegroundColor Green
    Write-Host "  ✓ 路径长度：$($root.Length) 字符（< 240）" -ForegroundColor Green
}

# 6. Visual C++ Build Tools 检查（可选）
Write-Host "`n[6/6] 检查 Visual C++ Build Tools（可选）..." -ForegroundColor Yellow
$vcFound = $false
try {
    $vcPath = Get-Command cl.exe -ErrorAction SilentlyContinue
    if ($vcPath) {
        Write-Host "  ✓ Visual C++ Build Tools 已安装：$($vcPath.Source)" -ForegroundColor Green
        $vcFound = $true
    }
} catch { }

if (-not $vcFound) {
    $warnings += "未检测到 Visual C++ Build Tools（某些 Python 包编译时需要）"
    Write-Host "  ⚠ Visual C++ Build Tools 未找到（可选）" -ForegroundColor Yellow
    Write-Host "     如需编译 dronecan 等包，请下载：https://visualstudio.microsoft.com/downloads/" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ 可以编译 C 扩展" -ForegroundColor Green
}

# 总结
Write-Host "`n================== 诊断结果 ==================`n" -ForegroundColor Cyan

if ($issues.Count -eq 0) {
    Write-Host "✓ 所有关键检查通过！可以开始安装。" -ForegroundColor Green
} else {
    Write-Host "✗ 发现 $($issues.Count) 个问题需要解决：`n" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "  • $issue" -ForegroundColor Red
    }
    Write-Host ""
}

if ($warnings.Count -gt 0) {
    Write-Host "⚠ $($warnings.Count) 个可选警告：`n" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "  • $warning" -ForegroundColor Yellow
    }
    Write-Host ""
}

if ($info.Count -gt 0) {
    foreach ($item in $info) {
        Write-Host "  ℹ $item" -ForegroundColor Cyan
    }
}

# 返回状态码
if ($issues.Count -gt 0) {
    exit 1
} else {
    exit 0
}
