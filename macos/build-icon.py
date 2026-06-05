#!/usr/bin/env python3
"""从 dog1.png 生成 macOS .icns 图标（用于桌面 GCS.app）。"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    src = root / "dog1.png"
    iconset = root / "macos" / "gcs-dog.iconset"
    output = root / "macos" / "gcs-dog.icns"

    if not src.is_file():
        print(f"❌ 找不到源图标: {src}")
        return 1

    # macOS 标准图标尺寸
    sizes = [16, 32, 64, 128, 256, 512, 1024]

    # 清空旧的 iconset
    if iconset.is_dir():
        import shutil
        shutil.rmtree(iconset)
    iconset.mkdir(parents=True, exist_ok=True)

    for size in sizes:
        # @1x
        out = iconset / f"icon_{size}x{size}.png"
        r = subprocess.run(
            ["sips", "-z", str(size), str(size), str(src), "--out", str(out)],
            capture_output=True, text=True
        )
        if r.returncode != 0:
            print(f"❌ sips 生成 {size}x{size} 失败: {r.stderr.strip()}")
            return 1

        # @2x (Retina) — 不超过 1024
        if size * 2 <= 1024:
            size2 = size * 2
            out2 = iconset / f"icon_{size}x{size}@2x.png"
            r = subprocess.run(
                ["sips", "-z", str(size2), str(size2), str(src), "--out", str(out2)],
                capture_output=True, text=True
            )
            if r.returncode != 0:
                print(f"❌ sips 生成 {size2}x{size2} 失败: {r.stderr.strip()}")
                return 1

    # 用 iconutil 转成 .icns
    r = subprocess.run(
        ["iconutil", "-c", "icns", str(iconset), "--output", str(output)],
        capture_output=True, text=True
    )
    if r.returncode != 0:
        print(f"❌ iconutil 转换失败: {r.stderr.strip()}")
        return 1

    # 清理临时 iconset
    import shutil
    shutil.rmtree(iconset)

    # 验证
    if output.is_file() and output.stat().st_size > 0:
        print(f"✅ 图标已生成: {output} ({output.stat().st_size / 1024:.0f} KB)")
        return 0
    else:
        print(f"❌ 图标文件无效: {output}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
