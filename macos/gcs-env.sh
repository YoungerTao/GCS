# GCS macOS 共享环境变量 — 由 install / start / stop / check-stack 等脚本 source。
# 不依赖用户手动 export；launchd plist 生成时也引用此处定义的值。

# 项目根目录（macos/ 的上一级）
if [ -z "${GCS_ROOT:-}" ]; then
  GCS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
export GCS_ROOT

export VENV_PY="${GCS_ROOT}/.venv/bin/python"
export GCS_LOG_DIR="${GCS_ROOT}/tools/logs"
export TMPDIR="${TMPDIR:-/tmp}"
export HOME="${HOME:-$(eval echo ~)}"

# Homebrew（Apple Silicon / Intel）— launchd 子进程默认 PATH 很短，需显式补齐
if [ -x /opt/homebrew/bin/brew ]; then
  # shellcheck disable=SC1091
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  # shellcheck disable=SC1091
  eval "$(/usr/local/bin/brew shellenv)"
fi
export PATH="${GCS_ROOT}/.venv/bin:${PATH:-/usr/bin:/bin}"

# 供 Python 子进程识别平台启动上下文
export GCS_PLATFORM="macos"
