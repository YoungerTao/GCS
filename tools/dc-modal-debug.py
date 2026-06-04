#!/usr/bin/env python3
"""Debug 脚本:打印页面状态,看 dc_demo 模式下节点表是否被填充。"""
import os
import time
import http.server
import socketserver
import threading
import socket
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def start_server():
    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_args, **_kwargs):
            return
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        try:
            sock.connect(("127.0.0.1", 5501))
            return
        except OSError:
            pass
    os.chdir(str(REPO_ROOT))
    httpd = socketserver.TCPServer(("127.0.0.1", 5501), QuietHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()


def main():
    start_server()
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(viewport={"width": 1280, "height": 900}).new_page()
        page.goto("http://127.0.0.1:5501/index.html?dc_demo=1", wait_until="domcontentloaded", timeout=15000)
        page.wait_for_selector(".main-tab", timeout=10000)
        page.click('[data-view="initial-setup"]')
        time.sleep(0.5)
        page.wait_for_selector('[data-setup-panel="dronecan"]', state="visible", timeout=10000)
        page.click('[data-setup-panel="dronecan"]')
        time.sleep(2.0)

        info = page.evaluate(
            """
            () => ({
                nodeCount: document.querySelectorAll('#sc-dc-node-body tr').length,
                menuButtons: document.querySelectorAll('[data-dc-menu-node]').length,
                panels: Array.from(document.querySelectorAll('.sc-dc-panel')).map(p => ({
                    panel: p.dataset.dcPanel,
                    active: p.classList.contains('active'),
                    visible: p.offsetParent !== null,
                })),
                setupPanelActive: document.querySelector('#setup-panel-dronecan')?.classList.contains('active'),
            })
            """
        )
        print("PAGE STATE:", info)

        page.screenshot(path="g:/soft/GCS/tools/dc-modal-screenshots/debug.png", full_page=False)
        print("Saved debug.png")
        browser.close()


if __name__ == "__main__":
    main()
