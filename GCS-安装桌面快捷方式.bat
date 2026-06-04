@echo off
setlocal
cd /d "%~dp0"

rem 强制使用 UTF-8 代码页，便于中文路径和输出正常显示（兼容含中文/空格的 clone 路径）
chcp 65001 >nul 2>&1

echo [1/4] 正在检查 Python 环境并准备 .venv 虚拟环境（优先使用官方 python.org Python，避免 Microsoft Store 沙箱问题）...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\setup-python-deps.ps1"
if errorlevel 1 (
  echo.
  echo [失败] GCS 核心依赖安装失败（requirements.txt 中的 dronecan / pyserial / pymavlink 等）。
  echo 常见原因：
  echo   - 未安装 Python，或使用了 Microsoft Store 版（路径含 WindowsApps，安装 bat/ps1 会明确报错）。
  echo   - PowerShell 执行策略受限（脚本已尝试 -ExecutionPolicy Bypass）。
  echo   - 路径含特殊字符或权限问题。
  echo.
  echo 请：
  echo   1. 从 https://www.python.org/downloads/ 下载官方 Windows installer，安装时勾选 "Add python.exe to PATH" 和 "py launcher"。
  echo   2. 删除当前目录下的 .venv 文件夹（如果存在）。
  echo   3. 重新双击本 "GCS-安装桌面快捷方式.bat"。
  echo.
  pause
  exit /b 1
)

echo.
echo [2/4] 依赖安装成功（已自动 pip install -r requirements.txt，包含 dronecan 用于 DroneCAN Node Tool 参数读取）。
echo.

echo [3/4] 正在创建桌面快捷方式 + 开始菜单快捷方式...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install-gcs-desktop.ps1" -WatchdogStartup
if errorlevel 1 (
  echo.
  echo [失败] 创建桌面快捷方式失败。
  echo 请确认 PowerShell 脚本执行权限，然后重试。
  pause
  exit /b 1
)

echo.
echo [4/4] 安装完成！
echo.
echo 现在可以：
echo   - 双击桌面上的 "GCS" 图标启动（推荐日常使用）
echo   - 或双击本目录下的 GCS.cmd
echo.
echo 提示：
echo   - 首次使用 DroneCAN Node Tool 读取节点参数前，建议重新运行一次本安装 bat（确保 .venv 完整）。
echo   - 如果遇到 ModuleNotFoundError: No module named 'dronecan' 或 WriteFile PermissionError，请重新运行本 bat。
echo   - 支持中文路径克隆目录（E:\GCS-测试 等）。
echo.
pause
