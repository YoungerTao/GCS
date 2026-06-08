#!/usr/bin/env python3
"""Ensure repo .venv exists with a working pip and GCS Python dependencies."""
from __future__ import annotations

import glob
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
VENV_DIR = REPO_ROOT / ".venv"
VENV_PY = VENV_DIR / "bin" / "python"
REQUIREMENTS = REPO_ROOT / "requirements.txt"
CORE_IMPORTS = (
    "import serial",
    "from pymavlink import mavutil",
    "import dronecan",
)


def _run(cmd: list[str], quiet: bool = True) -> bool:
    try:
        subprocess.run(
            cmd,
            cwd=str(REPO_ROOT),
            check=True,
            stdout=subprocess.DEVNULL if quiet else None,
            stderr=subprocess.DEVNULL if quiet else None,
        )
        return True
    except (subprocess.CalledProcessError, OSError):
        return False


def _system_python() -> str:
    for name in ("python3", "python"):
        path = shutil.which(name)
        if path:
            return path
    raise RuntimeError("未找到 python3，请先安装 Python 3.8+")


def _pip_ok(py: Path) -> bool:
    return _run([str(py), "-m", "pip", "--version"])


def _core_deps_ok(py: Path) -> bool:
    return _run([str(py), "-c", "; ".join(CORE_IMPORTS) + "; print('OK')"])


def _remove_broken_pip(py: Path) -> None:
    site = VENV_DIR / "lib"
    if not site.is_dir():
        return
    for pattern in ("pip", "pip-*.dist-info"):
        for path in site.glob(f"python*/site-packages/{pattern}"):
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            else:
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass


def _create_venv(py_exe: str) -> None:
    if VENV_DIR.is_dir():
        shutil.rmtree(VENV_DIR, ignore_errors=True)
    if not _run([py_exe, "-m", "venv", str(VENV_DIR)], quiet=False):
        raise RuntimeError("创建 .venv 失败")


def _repair_pip(py_exe: str) -> None:
    _remove_broken_pip(VENV_PY)
    if not _run([str(VENV_PY), "-m", "ensurepip", "--upgrade"], quiet=False):
        _create_venv(py_exe)
    if not _pip_ok(VENV_PY):
        raise RuntimeError("pip 自动修复失败")


def _pip_install(py: Path, *args: str) -> bool:
    return _run([str(py), "-m", "pip", "install", *args])


def ensure_venv(py_exe: str | None = None) -> dict:
    py_exe = py_exe or _system_python()
    created = False
    repaired = False

    if not VENV_PY.is_file():
        _create_venv(py_exe)
        created = True
    elif not _pip_ok(VENV_PY):
        _repair_pip(py_exe)
        repaired = True

    if not _pip_install(VENV_PY, "-U", "pip", "setuptools", "wheel"):
        _repair_pip(py_exe)
        repaired = True
        if not _pip_install(VENV_PY, "-U", "pip", "setuptools", "wheel"):
            raise RuntimeError("无法升级 pip")

    if REQUIREMENTS.is_file():
        if not _pip_install(VENV_PY, "-r", str(REQUIREMENTS)):
            if not repaired:
                _repair_pip(py_exe)
                repaired = True
            if not _pip_install(VENV_PY, "-r", str(REQUIREMENTS)):
                raise RuntimeError("requirements.txt 安装失败")

    optional = {}
    for pkg in ("Pillow", "playwright"):
        optional[pkg] = _pip_install(VENV_PY, pkg)

    if not _core_deps_ok(VENV_PY):
        if not repaired:
            _repair_pip(py_exe)
            repaired = True
            if REQUIREMENTS.is_file():
                _pip_install(VENV_PY, "-r", str(REQUIREMENTS))
        if not _core_deps_ok(VENV_PY):
            raise RuntimeError("核心依赖验证失败 (pyserial, pymavlink, dronecan)")

    return {
        "ok": True,
        "venv": str(VENV_PY),
        "created": created,
        "pipRepaired": repaired,
        "optional": optional,
    }


def main() -> int:
    try:
        result = ensure_venv()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    flags = []
    if result.get("created"):
        flags.append("新建 .venv")
    if result.get("pipRepaired"):
        flags.append("已修复 pip")
    if flags:
        print("  " + "，".join(flags))
    opt = result.get("optional") or {}
    for name, ok in opt.items():
        if not ok:
            print(f"  WARN: {name} 未安装（可选）", file=sys.stderr)
    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
