#!/usr/bin/env python3
"""
DroneCAN 节点参数弹窗 - 自动化截图工具(用于验证窗体重叠/越界修复)

用法:
    1) 启动一个能服务本仓库的 HTTP 服务器(任选其一):
         python -m http.server 5501 --directory g:/soft/GCS
         或:启动项目自带的 GCS.cmd / Start-GCS.bat
    2) 运行本脚本:
         python tools/dc-modal-screenshot.py
    3) 截图会输出到 tools/dc-modal-screenshots/<时间戳>/*.png
"""
from __future__ import annotations

import os
import sys
import time
import http.server
import socketserver
import threading
import socket
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TOOLS_DIR = REPO_ROOT / "tools"
OUT_DIR = TOOLS_DIR / "dc-modal-screenshots"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 追加 ?dc_demo=1 让页面在没有真实 DroneCAN 硬件时,也能渲染出一个 DroneCAN Battery 示例节点
BASE_URL = os.environ.get("GCS_URL", "http://127.0.0.1:8766/index.html?dc_demo=1")
VIEWPORT = {"width": 1280, "height": 900}


def _start_static_server_if_needed(port: int = 5501) -> None:
    """如果本机指定端口没起服务,起一个临时 http.server(只在脚本生命周期内有效)。"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        try:
            sock.connect(("127.0.0.1", port))
            return  # 已有服务
        except OSError:
            pass

    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args, **_kwargs):
            return

    os.chdir(str(REPO_ROOT))
    httpd = socketserver.TCPServer(("127.0.0.1", port), QuietHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    print(f"[screenshot] 启动临时 HTTP 服务器: http://127.0.0.1:{port} 根目录={REPO_ROOT}")


def _inject_fake_params(page, count: int = 30) -> None:
    """绕开真实 DroneCAN GetSet,直接往 #sc-dc-param-list tbody 塞假参数。"""
    page.evaluate(
        """
        (count) => {
            const fake = [];
            for (let i = 0; i < count; i += 1) {
                fake.push({
                    index: i,
                    name: 'GPS1_FAKE_PARAM_' + i,
                    type: i % 4 === 0 ? 'real' : 'integer',
                    value: i * 7,
                });
            }
            const tbody = document.querySelector('#sc-dc-param-list');
            if (tbody) {
                tbody.innerHTML = fake.map((p, idx) => `
                    <tr class="sc-dc-row${idx === 0 ? ' active' : ''}" data-dc-param-index="${p.index}">
                        <td>${p.index}</td>
                        <td>${p.name}</td>
                        <td>${p.value}</td>
                        <td>${p.type === 'real' ? 'float32' : 'int64'}</td>
                    </tr>
                `).join('');
            }
        }
        """,
        count,
    )


def _open_parameters_modal(page) -> bool:
    """点开任意一个非禁用的 Parameters 菜单,弹窗出现返回 True。"""
    menu_buttons = page.query_selector_all('[data-dc-menu-node]')
    print(f"[screenshot] 找到 {len(menu_buttons)} 个节点菜单按钮")
    for btn in menu_buttons:
        try:
            btn.click(timeout=2000)
        except Exception as e:
            print(f"[screenshot] 菜单按钮 click 失败: {e}")
            continue
        time.sleep(0.3)
        params = page.query_selector('[data-dc-menu-action="parameters"]')
        if params and not params.is_disabled():
            params.click()
            return True
        page.keyboard.press("Escape")
        page.evaluate("document.querySelector('#sc-dc-menu')?.setAttribute('hidden','')")
        time.sleep(0.2)
    return False


def main() -> int:
    _start_static_server_if_needed()

    from playwright.sync_api import sync_playwright

    stamp = time.strftime("%Y%m%d-%H%M%S")
    out_dir = OUT_DIR / stamp
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[screenshot] 目标 URL: {BASE_URL}")
    print(f"[screenshot] 输出目录: {out_dir}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport=VIEWPORT)
        page = context.new_page()
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=15000)
        page.wait_for_selector('.main-tab', timeout=10000)
        page.click('[data-view="initial-setup"]')
        time.sleep(0.5)
        page.wait_for_selector('[data-setup-panel="dronecan"]', state='visible', timeout=10000)
        page.click('[data-setup-panel="dronecan"]')
        time.sleep(2.0)  # 等 tick() 完成节点表渲染

        if not _open_parameters_modal(page):
            print("[screenshot] FAIL: 找不到能开启 Parameters 弹窗的节点")
            browser.close()
            return 3

        page.wait_for_selector('.sc-dc-modal-grid', timeout=10000)
        time.sleep(0.4)

        page.screenshot(path=str(out_dir / "01-modal-fresh.png"), full_page=False)
        print(f"[screenshot] OK: 01-modal-fresh.png")

        _inject_fake_params(page, count=30)
        time.sleep(0.3)
        page.screenshot(path=str(out_dir / "02-modal-with-fake-params.png"), full_page=False)
        print(f"[screenshot] OK: 02-modal-with-fake-params.png")

        modal = page.query_selector('.sc-dc-modal')
        if modal:
            modal.screenshot(path=str(out_dir / "03-modal-element.png"))
            print(f"[screenshot] OK: 03-modal-element.png")

        # 度量:input 与 select 是否在卡片内部
        rects = page.evaluate(
            """
            () => {
                const r = (el) => el ? el.getBoundingClientRect() : null;
                const cards = Array.from(document.querySelectorAll('.sc-dc-modal-card'));
                const card0 = cards[0] || null;
                const card1 = cards[1] || null;
                const search = document.querySelector('#sc-dc-param-search');
                return {
                    modal: r(document.querySelector('.sc-dc-modal')),
                    body:  r(document.querySelector('.sc-dc-modal-body')),
                    grid:  r(document.querySelector('.sc-dc-modal-grid')),
                    card0: r(card0),
                    card1: r(card1),
                    searchInput: r(search),
                };
            }
            """
        )
        print("\n[screenshot] 布局度量:")
        for k, v in rects.items():
            print(f"    {k}: {v}")

        # 关键校验
        card0 = rects.get("card0") or {}
        search = rects.get("searchInput") or {}
        body = rects.get("body") or {}
        ok = True
        for c_idx, c in enumerate([card0]):
            c_left = c.get("x", 0)
            c_right = c.get("x", 0) + c.get("width", 0)
            s_left = search.get("x", 0)
            s_right = search.get("x", 0) + search.get("width", 0)
            inside = s_left >= c_left - 1 and s_right <= c_right + 1
            mark = "PASS" if inside else "FAIL"
            print(
                f"    {mark} card[{c_idx}] searchInput left={s_left:.0f} right={s_right:.0f} "
                f"vs card [{c_left:.0f}, {c_right:.0f}]"
            )
            if not inside:
                ok = False
        # body 范围
        b_left = body.get("x", 0)
        b_right = body.get("x", 0) + body.get("width", 0)
        for c_idx, c in enumerate([rects.get("card0") or {}, rects.get("card1") or {}]):
            c_left = c.get("x", 0)
            c_right = c.get("x", 0) + c.get("width", 0)
            inside = c_left >= b_left - 1 and c_right <= b_right + 1
            mark = "PASS" if inside else "FAIL"
            print(
                f"    {mark} card[{c_idx}] [{c_left:.0f}, {c_right:.0f}] vs body [{b_left:.0f}, {b_right:.0f}]"
            )
            if not inside:
                ok = False

        browser.close()

    print(f"\n[screenshot] 全部截图保存在: {out_dir}")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
