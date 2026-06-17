#!/usr/bin/env python3
"""Embedded MapLibre release console for Flareless."""

from __future__ import annotations

import argparse
import html
import json
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path
from typing import Any

from server import DEFAULT_HOST, DEFAULT_PORT, run_server

ROOT = Path(__file__).resolve().parent
UI_DIR = ROOT / "ui"
STATE_DIR = ROOT / "state"
APP_SETTINGS_FILE = STATE_DIR / "app-settings.json"

DEFAULT_APP_SETTINGS: dict[str, Any] = {
    "version": 1,
    "keepServerRunningAfterGuiClose": False,
    "agent": {
        "mode": "free-local",
        "freeAgent": "local-rule-agent",
        "paidProvider": "openai-compatible",
        "paidModel": "gpt-4o-mini",
        "apiKeyConfigured": False,
        "apiKeyPreview": "",
        "apiKeyStoredInDemo": False,
    },
    "hosting": {
        "safeApplyMode": "generate-instructions-only",
        "locations": [],
    },
}


def read_app_settings() -> dict[str, Any]:
    if not APP_SETTINGS_FILE.exists():
        return json.loads(json.dumps(DEFAULT_APP_SETTINGS))
    try:
        data = json.loads(APP_SETTINGS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return json.loads(json.dumps(DEFAULT_APP_SETTINGS))
    if not isinstance(data, dict):
        return json.loads(json.dumps(DEFAULT_APP_SETTINGS))
    merged = json.loads(json.dumps(DEFAULT_APP_SETTINGS))
    for key, value in data.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key].update(value)
        else:
            merged[key] = value
    return merged


def mask_api_key(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    if len(value) <= 8:
        return "configured"
    return f"{value[:4]}...{value[-4:]}"


def normalize_host_profile(item: dict[str, Any], index: int = 0) -> dict[str, str | int]:
    """Normalize a host profile without storing credentials or secrets."""
    raw_issue_count = item.get("issueCount", 0)
    try:
        issue_count = max(0, int(raw_issue_count))
    except (TypeError, ValueError):
        issue_count = 0
    return {
        "id": str(item.get("id") or f"host-{index + 1}"),
        "name": str(item.get("name") or "Hosted location"),
        "type": str(item.get("type") or item.get("platform") or "manual"),
        "platform": str(item.get("platform") or item.get("type") or "manual"),
        "domain": str(item.get("domain") or ""),
        "host": str(item.get("host") or ""),
        "path": str(item.get("path") or ""),
        "detectedFile": str(item.get("detectedFile") or ""),
        "applyMode": str(item.get("applyMode") or "manual-instructions"),
        "environment": str(item.get("environment") or "production"),
        "criticality": str(item.get("criticality") or "medium"),
        "status": str(item.get("status") or "needs-setup"),
        "lastCheck": str(item.get("lastCheck") or "never"),
        "issueCount": issue_count,
        "owner": str(item.get("owner") or "me"),
        "notes": str(item.get("notes") or ""),
    }


def write_app_settings(payload: dict[str, Any]) -> dict[str, Any]:
    settings = read_app_settings()
    if not isinstance(payload, dict):
        payload = {}

    if "keepServerRunningAfterGuiClose" in payload:
        settings["keepServerRunningAfterGuiClose"] = bool(payload.get("keepServerRunningAfterGuiClose"))

    agent = payload.get("agent")
    if isinstance(agent, dict):
        settings_agent = settings.setdefault("agent", {})
        for key in ["mode", "freeAgent", "paidProvider", "paidModel"]:
            if key in agent:
                settings_agent[key] = str(agent.get(key) or "")
        api_key = str(agent.get("apiKey") or "")
        if api_key.strip():
            settings_agent["apiKeyConfigured"] = True
            settings_agent["apiKeyPreview"] = mask_api_key(api_key)
            settings_agent["apiKeyStoredInDemo"] = False
        elif agent.get("clearApiKey"):
            settings_agent["apiKeyConfigured"] = False
            settings_agent["apiKeyPreview"] = ""
            settings_agent["apiKeyStoredInDemo"] = False

    hosting = payload.get("hosting")
    if isinstance(hosting, dict):
        safe_apply = hosting.get("safeApplyMode")
        if safe_apply:
            settings.setdefault("hosting", {})["safeApplyMode"] = str(safe_apply)
        locations = hosting.get("locations")
        if isinstance(locations, list):
            cleaned = []
            for item in locations:
                if not isinstance(item, dict):
                    continue
                cleaned.append(normalize_host_profile(item, len(cleaned)))
            settings.setdefault("hosting", {})["locations"] = cleaned

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    APP_SETTINGS_FILE.write_text(json.dumps(settings, indent=2), encoding="utf-8")
    return settings


class FlarelessApi:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def open_map(self) -> dict[str, str]:
        return {"baseUrl": self.base_url, "state": "paused"}

    def get_app_settings(self) -> dict[str, Any]:
        return read_app_settings()

    def save_app_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        return write_app_settings(payload)


def render_embedded_html(base_url: str) -> str:
    """Load the componentized HTML, CSS, and JS for the embedded webview."""
    template = (UI_DIR / "index.html").read_text(encoding="utf-8")
    styles = (UI_DIR / "styles.css").read_text(encoding="utf-8")
    scripts = [
        (UI_DIR / "app.js").read_text(encoding="utf-8"),
    ]
    for optional_script_name in [
        "cockpit_topology.js",
        "agent_hosting_ui.js",
        "host_profiles_metrics.js",
        "dashboard_map_isolation.js",
    ]:
        optional_script = UI_DIR / optional_script_name
        if optional_script.exists():
            scripts.append(optional_script.read_text(encoding="utf-8"))

    # Keep each UI module in its own script block. This prevents function hoisting
    # from later optional modules from overriding app.js functions before app.js
    # finishes initializing the MapLibre dashboard map.
    script = "\n</script>\n<script>\n".join(scripts)
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
    thread = threading.Thread(target=server.serve_forever, daemon=False)
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
        settings = read_app_settings()
        keep_running = bool(settings.get("keepServerRunningAfterGuiClose"))
        if keep_running:
            print("Flareless GUI closed. Server is still running because keepServerRunningAfterGuiClose=true.")
            print(f"Server URL: {base_url}")
            print("Press Ctrl+C in this console to stop the server.")
            try:
                thread.join()
            except KeyboardInterrupt:
                print("\nStopping persistent Flareless server.")
                server.shutdown()
                server.server_close()
        else:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the embedded MapLibre Flareless console.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()
    run_embedded_console(args.host, args.port)


if __name__ == "__main__":
    main()
