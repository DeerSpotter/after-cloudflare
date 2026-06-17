#!/usr/bin/env python3
"""Embedded MapLibre release console for Flareless."""

from __future__ import annotations

import argparse
import html
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path

from server import DEFAULT_HOST, DEFAULT_PORT, run_server

ROOT = Path(__file__).resolve().parent
UI_DIR = ROOT / "ui"


class FlarelessApi:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def open_map(self) -> dict[str, str]:
        return {"baseUrl": self.base_url, "state": "paused"}


def render_embedded_html(base_url: str) -> str:
    """Load the componentized HTML, CSS, and JS for the embedded webview."""
    template = (UI_DIR / "index.html").read_text(encoding="utf-8")
    styles = (UI_DIR / "styles.css").read_text(encoding="utf-8")
    scripts = [
        (UI_DIR / "app.js").read_text(encoding="utf-8"),
    ]
    cockpit_topology = UI_DIR / "cockpit_topology.js"
    if cockpit_topology.exists():
        scripts.append(cockpit_topology.read_text(encoding="utf-8"))
    script = "\n\n".join(scripts)
    return (
        template.replace("__BASE_URL__", html.escape(base_url.rstrip("/"), quote=True))
        .replace("__APP_CSS__", styles)
        .replace("__APP_JS__", script)
    )


def run_embedded_console(host: str, port: int) -> None:
    try:
        import webview  # type: ignore[import-not-found]
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "pywebview is required for the embedded MapLibre GUI. Install it with: python -m pip install pywebview"
        ) from exc

    server: ThreadingHTTPServer = run_server(host, port)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.25)

    base_url = f"http://{host}:{port}"
    try:
        webview.create_window(
            "Flareless Command Center",
            html=render_embedded_html(base_url),
            js_api=FlarelessApi(base_url),
            width=1480,
            height=920,
            min_size=(1180, 760),
        )
        webview.start(debug=False)
    finally:
        server.shutdown()
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the embedded MapLibre Flareless console.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()
    run_embedded_console(args.host, args.port)


if __name__ == "__main__":
    main()
