"""Local HTTP health checks for GCS services."""
from __future__ import annotations

import socket
import urllib.error
import urllib.request
from urllib.parse import urlparse


def local_http_ok(url: str, timeout_s: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout_s) as resp:
            return resp.status == 200
    except Exception:
        pass
    return _local_http_ok_socket(url, timeout_s)


def local_http_post_ok(url: str, timeout_s: float = 45.0) -> bool:
    try:
        req = urllib.request.Request(url, method="POST")
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return resp.status == 200
    except Exception:
        pass
    return _local_http_post_socket(url, timeout_s)


def _local_http_ok_socket(url: str, timeout_s: float) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    host = parsed.hostname
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    request = (
        f"GET {path} HTTP/1.0\r\n"
        f"Host: {host}\r\n"
        "Connection: close\r\n"
        "\r\n"
    ).encode("ascii")
    try:
        with socket.create_connection((host, port), timeout=timeout_s) as sock:
            sock.sendall(request)
            chunk = sock.recv(512)
    except OSError:
        return False
    return chunk.startswith(b"HTTP/") and b" 200 " in chunk.split(b"\r\n", 1)[0]


def _local_http_post_socket(url: str, timeout_s: float) -> bool:
    parsed = urlparse(url)
    if parsed.scheme != "http" or not parsed.hostname:
        return False
    host = parsed.hostname
    port = parsed.port or 80
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    request = (
        f"POST {path} HTTP/1.0\r\n"
        f"Host: {host}\r\n"
        "Content-Length: 0\r\n"
        "Connection: close\r\n"
        "\r\n"
    ).encode("ascii")
    try:
        with socket.create_connection((host, port), timeout=timeout_s) as sock:
            sock.settimeout(timeout_s)
            sock.sendall(request)
            chunk = sock.recv(512)
    except OSError:
        return False
    return chunk.startswith(b"HTTP/") and b" 200 " in chunk.split(b"\r\n", 1)[0]
