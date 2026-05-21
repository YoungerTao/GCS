#!/usr/bin/env python3
"""Live Server Go Live / GCS dev: start stack, open Chrome or editor Simple Browser.

Go Live 由 Live Server 自带 Chrome 打开；勿在 AdvanceCustomBrowserCmdLine 里写 --chrome（会被扩展按 -- 拆开）。
任务/终端仍可用本脚本的 --chrome / --editor-browser。
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETTINGS = ROOT / ".vscode" / "settings.json"
WATCHDOG_PING = "http://127.0.0.1:8767/ping"
LAUNCH_URL = "http://127.0.0.1:8767/launch"
DEFAULT_URI = "http://127.0.0.1:5501/index.html"


def ping(url: str, timeout_s: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout_s) as resp:
            return resp.status == 200
    except Exception:
        return False


def read_dev_browser_setting() -> str:
    try:
        raw = SETTINGS.read_text(encoding="utf-8")
        raw = re.sub(r"/\*.*?\*/", "", raw, flags=re.DOTALL)
        raw = re.sub(r"//.*?$", "", raw, flags=re.MULTILINE)
        data = json.loads(raw)
        mode = str(data.get("gcs.devBrowser", "chrome")).strip().lower()
        return mode if mode in ("chrome", "editor") else "chrome"
    except Exception:
        return "chrome"


def resolve_browser_mode() -> str:
    if "--editor-browser" in sys.argv or "--editor" in sys.argv:
        return "editor"
    if "--chrome" in sys.argv:
        return "chrome"
    if "--no-browser" in sys.argv:
        return "none"
    # 无 -- 前缀的 chrome（避免被 Live Server 误拆，仅供终端脚本）
    for arg in sys.argv[1:]:
        if arg.startswith("http://") or arg.startswith("https://"):
            continue
        if arg.lower() == "chrome":
            return "chrome"
    return read_dev_browser_setting()


def start_watchdog() -> None:
    if ping(WATCHDOG_PING):
        return
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0
    subprocess.Popen(
        [sys.executable, str(ROOT / "tools" / "gcs_watchdog.py")],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=flags,
    )
    for _ in range(30):
        if ping(WATCHDOG_PING, 1.0):
            return
        time.sleep(0.2)


def launch_runtime_async() -> None:
    def _run() -> None:
        try:
            req = urllib.request.Request(LAUNCH_URL, method="POST")
            urllib.request.urlopen(req, timeout=45)
        except Exception:
            pass

    threading.Thread(target=_run, daemon=True).start()


def open_chrome(uri: str) -> None:
    if sys.platform == "win32":
        candidates = [
            os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        ]
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        for exe in candidates:
            if os.path.isfile(exe):
                subprocess.Popen(
                    [exe, uri],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=flags,
                )
                return
        os.startfile(uri)  # type: ignore[attr-defined]
        return
    if sys.platform == "darwin":
        subprocess.run(["open", "-a", "Google Chrome", uri], check=False)
        return
    subprocess.Popen(["xdg-open", uri], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def open_editor_browser(uri: str) -> bool:
    """Open Cursor/VS Code built-in Simple Browser."""
    encoded = urllib.parse.quote(uri, safe=":/?#[]@!$&'()*+,;=")
    targets = [
        f"vscode://vscode.simple-browser/show?url={encoded}",
        f"cursor://vscode.simple-browser/show?url={encoded}",
    ]
    for cli in ("cursor", "code"):
        if not shutil.which(cli):
            continue
        for target in targets:
            try:
                subprocess.run(
                    [cli, "--open-url", target],
                    cwd=str(ROOT),
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                )
                return True
            except Exception:
                continue
    print(
        "未能自动打开内置浏览器。请先 Go Live，再按 Ctrl+Shift+P →「Simple Browser: Show」\n"
        f"地址：{uri}",
        file=sys.stderr,
    )
    return False


def warn_if_live_server_down(uri: str) -> None:
    if ping(uri, 1.5):
        return
    print(
        "提示：Live Server 可能尚未启动。请先在 index.html 上点 Go Live，再打开内置浏览器。",
        file=sys.stderr,
    )


def main() -> int:
    os.chdir(ROOT)
    uri = DEFAULT_URI
    for arg in sys.argv[1:]:
        if arg.startswith("http://") or arg.startswith("https://"):
            uri = arg
            break

    mode = resolve_browser_mode()
    start_watchdog()
    launch_runtime_async()

    if mode == "none":
        return 0

    warn_if_live_server_down(uri)

    if mode == "editor":
        open_editor_browser(uri)
    else:
        open_chrome(uri)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
