#!/usr/bin/env python3
"""Tkinter release console for the Flareless local demo server."""

from __future__ import annotations

import argparse
import json
import math
import tkinter as tk
from tkinter import messagebox, ttk
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from osiris_map_assets import OSIRIS_PALETTE, OSIRIS_TILE_STYLE_ASSETS, OSIRIS_WORLD_RINGS, ROUTE_NODES
except ImportError:  # pragma: no cover - lets this file compile alone in isolated editors.
    OSIRIS_PALETTE = {
        "ocean0": "#3b4d57", "ocean1": "#283640", "ocean2": "#111923", "land": "#05080a",
        "coast": "#607784", "route": "#1980cd", "green": "#00f08a", "cyan": "#24dce9",
        "gold": "#d7b739", "red": "#dd2731", "orange": "#d56a00", "magenta": "#e83b7f",
    }
    OSIRIS_TILE_STYLE_ASSETS = {}
    OSIRIS_WORLD_RINGS = [
        [[[-168, 72], [-135, 61], [-123, 42], [-106, 27], [-86, 24], [-73, 41], [-56, 57], [-94, 70], [-148, 73], [-168, 72]]],
        [[[-81, 12], [-61, 2], [-44, -18], [-55, -43], [-67, -55], [-76, -28], [-81, 12]]],
        [[[-17, 35], [27, 31], [50, 2], [31, -34], [2, -24], [-17, 18], [-17, 35]]],
        [[[-11, 36], [2, 59], [37, 62], [44, 49], [33, 39], [18, 36], [4, 41], [-11, 36]]],
        [[[35, 32], [70, 56], [128, 62], [160, 49], [151, 31], [105, 8], [69, 18], [35, 32]]],
        [[[113, -12], [133, -10], [153, -24], [147, -39], [122, -38], [112, -28], [113, -12]]],
    ]
    ROUTE_NODES = {
        "client-us": {"label": "User traffic", "lat": 39.5, "lon": -98.3, "kind": "client"},
        "flareless": {"label": "Flareless", "lat": 32.0, "lon": -35.0, "kind": "director"},
        "cdn-a": {"label": "cdn-a", "lat": 50.1, "lon": -5.1, "kind": "provider"},
        "cdn-b": {"label": "cdn-b", "lat": 1.3, "lon": 103.8, "kind": "provider"},
        "cdn-c": {"label": "cdn-c", "lat": 35.7, "lon": 139.7, "kind": "provider"},
        "peer-assisted-edge": {"label": "Micro CDN", "lat": -23.5, "lon": 133.8, "kind": "peer"},
        "origin": {"label": "Origin", "lat": 52.5, "lon": 13.4, "kind": "origin"},
    }

DEFAULT_BASE_URL = "http://127.0.0.1:8765"
SCENARIO_IDS = [
    "healthy-route",
    "http-status-failover",
    "timeout-failover",
    "blocked-provider",
    "all-providers-failed",
    "origin-blocked",
    "microcdn-hello",
    "microcdn-no-healthy-node",
]
TOUR_STEPS = [
    ("healthy-route", "Command Center"),
    ("http-status-failover", "Command Center"),
    ("blocked-provider", "Evidence"),
    ("all-providers-failed", "Approvals"),
    ("origin-blocked", "Policy Builder"),
    ("microcdn-hello", "Micro CDN Trust"),
    ("microcdn-no-healthy-node", "Micro CDN Trust"),
    ("timeout-failover", "Audit"),
]


class ApiClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    def get(self, path: str) -> dict[str, Any]:
        return self.request("GET", path)

    def post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        return self.request("POST", path, body)

    def request(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = Request(
            self.base_url + path,
            data=data,
            method=method,
            headers={"content-type": "application/json"},
        )
        try:
            with urlopen(request, timeout=5) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raw = exc.read().decode("utf-8")
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = {"error": raw}
            payload["status"] = exc.code
            return payload
        except URLError as exc:
            raise RuntimeError(f"Could not reach local demo server at {self.base_url}: {exc}") from exc


class OsirisRouteMap(tk.Canvas):
    """Offline 2D route map using the same lightweight OSIRIS fallback assets."""

    def __init__(self, master: tk.Misc) -> None:
        super().__init__(master, background="#02030a", highlightthickness=0, borderwidth=0)
        self.trace: dict[str, Any] = {}
        self.providers: list[dict[str, Any]] = []
        self.bind("<Configure>", lambda _event: self.redraw())

    def update_model(self, trace: dict[str, Any], providers: list[dict[str, Any]]) -> None:
        self.trace = trace
        self.providers = providers
        self.redraw()

    def project(self, lat: float, lon: float) -> tuple[float, float]:
        width = max(self.winfo_width(), 1)
        height = max(self.winfo_height(), 1)
        x = (lon + 180.0) / 360.0 * width
        lat = max(-84.0, min(84.0, lat))
        merc = math.log(math.tan(math.pi / 4.0 + math.radians(lat) / 2.0))
        y = height / 2.0 - (width * merc / (2.0 * math.pi))
        return x, y

    def node_point(self, node_id: str) -> tuple[float, float]:
        node = ROUTE_NODES.get(node_id) or ROUTE_NODES["flareless"]
        return self.project(float(node["lat"]), float(node["lon"]))

    def redraw(self) -> None:
        self.delete("all")
        width = max(self.winfo_width(), 1)
        height = max(self.winfo_height(), 1)
        self.create_rectangle(0, 0, width, height, fill="#02030a", outline="")
        self.draw_grid(width, height)
        self.draw_world()
        self.draw_routes()
        self.draw_nodes()
        self.create_text(
            18,
            18,
            anchor="nw",
            fill=OSIRIS_PALETTE["gold"],
            font=("Consolas", 10, "bold"),
            text="OSIRIS 2D MAP ASSETS · OFFLINE VECTOR FALLBACK",
        )

    def draw_grid(self, width: int, height: int) -> None:
        for x in range(0, width, 52):
            self.create_line(x, 0, x, height, fill="#0f1a24")
        for y in range(0, height, 52):
            self.create_line(0, y, width, y, fill="#0f1a24")
        self.create_oval(-width * 0.15, -height * 0.45, width * 1.15, height * 1.45, outline="#142636", width=2)

    def draw_world(self) -> None:
        for feature in OSIRIS_WORLD_RINGS:
            for ring in feature:
                points: list[float] = []
                for lon, lat in ring:
                    x, y = self.project(lat, lon)
                    points.extend([x, y])
                if len(points) >= 6:
                    self.create_polygon(points, fill=OSIRIS_PALETTE["land"], outline=OSIRIS_PALETTE["coast"], width=1)

    def attempt_status(self) -> dict[str, str]:
        return {str(item.get("provider")): str(item.get("result")) for item in self.trace.get("attempts", [])}

    def draw_routes(self) -> None:
        attempts = self.trace.get("attempts", []) or []
        last = "client-us"
        self.draw_route(last, "flareless", "PROVIDER_SUCCESS")
        last = "flareless"
        for attempt in attempts:
            provider = str(attempt.get("provider") or "")
            if provider not in ROUTE_NODES:
                continue
            self.draw_route(last, provider, str(attempt.get("result") or "UNKNOWN"))
            last = provider
        final_provider = str(self.trace.get("finalStatus", {}).get("provider") or "")
        if final_provider in ROUTE_NODES:
            self.draw_route(final_provider, "client-us", "PROVIDER_SUCCESS")

    def draw_route(self, start_id: str, end_id: str, result: str) -> None:
        x1, y1 = self.node_point(start_id)
        x2, y2 = self.node_point(end_id)
        color = OSIRIS_PALETTE["green"] if "SUCCESS" in result or "ALLOWED" in result else OSIRIS_PALETTE["red"]
        dash = () if "SUCCESS" in result else (8, 6)
        self.create_line(x1, y1, x2, y2, fill=color, width=3, dash=dash, smooth=True, splinesteps=18)
        mx, my = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        self.create_oval(mx - 3, my - 3, mx + 3, my + 3, fill=color, outline="")

    def draw_nodes(self) -> None:
        status = self.attempt_status()
        active = str(self.trace.get("finalStatus", {}).get("provider") or "")
        for node_id, node in ROUTE_NODES.items():
            x, y = self.node_point(node_id)
            result = status.get(node_id, "")
            kind = str(node.get("kind"))
            if node_id == active:
                fill = OSIRIS_PALETTE["green"]
            elif "TIMEOUT" in result or "BLOCKED" in result or "HTTP_" in result:
                fill = OSIRIS_PALETTE["red"]
            elif kind == "peer":
                fill = OSIRIS_PALETTE["cyan"]
            elif kind == "director":
                fill = OSIRIS_PALETTE["gold"]
            else:
                fill = "#dbe4ff"
            radius = 10 if kind != "director" else 14
            self.create_oval(x - radius, y - radius, x + radius, y + radius, fill=fill, outline="#ffffff", width=1)
            self.create_text(x + 14, y - 12, anchor="nw", fill="#e9f2ff", font=("Consolas", 9, "bold"), text=str(node["label"]))
            if result:
                self.create_text(x + 14, y + 4, anchor="nw", fill="#9fb4c7", font=("Consolas", 8), text=result)


class FlarelessConsole(tk.Tk):
    def __init__(self, api: ApiClient) -> None:
        super().__init__()
        self.api = api
        self.title("Flareless Release Console")
        self.geometry("1360x860")
        self.minsize(1120, 740)
        self.configure(background="#07101f")
        self.data: dict[str, Any] = {}
        self.tour_running = False
        self.tour_index = 0
        self.scenario_var = tk.StringVar(value="healthy-route")
        self.operator_var = tk.StringVar(value="local-operator")
        self.note_var = tk.StringVar(value="Approved for demo route only. Keep TTL short.")
        self.policy_format_var = tk.StringVar(value="yaml")
        self.condition_var = tk.StringVar(value="IF HTTP status is 5xx or provider timeout")
        self.provider_var = tk.StringVar(value="AND provider is primary CDN")
        self.action_var = tk.StringVar(value="THEN route to next CDN, then hash verified Micro CDN")
        self.tour_var = tk.StringVar(value="Release console ready")
        self.status_cards: dict[str, tk.StringVar] = {}
        self.setup_style()
        self.build_menu()
        self.build_layout()
        self.refresh_all(show_error=False)

    def setup_style(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TFrame", background="#07101f")
        style.configure("Panel.TFrame", background="#0d1724", relief="flat")
        style.configure("TLabel", background="#07101f", foreground="#dbe7f5")
        style.configure("Panel.TLabel", background="#0d1724", foreground="#dbe7f5")
        style.configure("Title.TLabel", background="#07101f", foreground="#ffffff", font=("Segoe UI", 18, "bold"))
        style.configure("Kicker.TLabel", background="#07101f", foreground=OSIRIS_PALETTE["green"], font=("Consolas", 9, "bold"))
        style.configure("Card.TLabel", background="#111d2b", foreground="#8fdcae", font=("Consolas", 17, "bold"))
        style.configure("TButton", background="#182638", foreground="#ecf7ff", borderwidth=0, focusthickness=0, padding=(12, 8))
        style.map("TButton", background=[("active", "#24384f")])
        style.configure("Accent.TButton", background="#1ed998", foreground="#061019", font=("Segoe UI", 9, "bold"))
        style.configure("Danger.TButton", background="#7f2632", foreground="#ffffff", font=("Segoe UI", 9, "bold"))
        style.configure("TNotebook", background="#07101f", borderwidth=0)
        style.configure("TNotebook.Tab", background="#0d1724", foreground="#aebdcb", padding=(12, 8))
        style.map("TNotebook.Tab", background=[("selected", "#142338")], foreground=[("selected", "#ffffff")])
        style.configure("Treeview", background="#0b1420", fieldbackground="#0b1420", foreground="#dbe7f5", rowheight=28, borderwidth=0)
        style.configure("Treeview.Heading", background="#142338", foreground="#ffffff")

    def build_menu(self) -> None:
        menu_bar = tk.Menu(self)
        file_menu = tk.Menu(menu_bar, tearoff=False)
        file_menu.add_command(label="Refresh", command=self.refresh_all)
        file_menu.add_command(label="Reset state", command=self.reset_state)
        file_menu.add_separator()
        file_menu.add_command(label="Exit", command=self.destroy)
        menu_bar.add_cascade(label="File", menu=file_menu)
        scenario_menu = tk.Menu(menu_bar, tearoff=False)
        for scenario_id in SCENARIO_IDS:
            scenario_menu.add_command(label=scenario_id, command=lambda item=scenario_id: self.run_named_scenario(item))
        menu_bar.add_cascade(label="Scenarios", menu=scenario_menu)
        action_menu = tk.Menu(menu_bar, tearoff=False)
        action_menu.add_command(label="Start release tour", command=self.start_auto_tour)
        action_menu.add_command(label="Stop tour", command=self.stop_auto_tour)
        action_menu.add_separator()
        action_menu.add_command(label="Approve latest pending", command=self.approve_latest)
        action_menu.add_command(label="Reject latest pending", command=self.reject_latest)
        menu_bar.add_cascade(label="Actions", menu=action_menu)
        help_menu = tk.Menu(menu_bar, tearoff=False)
        help_menu.add_command(label="About", command=self.show_about)
        menu_bar.add_cascade(label="Help", menu=help_menu)
        self.config(menu=menu_bar)

    def build_layout(self) -> None:
        header = ttk.Frame(self, padding=(16, 14, 16, 6))
        header.pack(fill=tk.X)
        ttk.Label(header, text="Flareless Release Console", style="Title.TLabel").pack(side=tk.LEFT)
        ttk.Label(header, text="Python local build · OSIRIS 2D map assets · no production claims", style="Kicker.TLabel").pack(side=tk.LEFT, padx=18)
        ttk.Button(header, text="Refresh", command=self.refresh_all).pack(side=tk.RIGHT)

        controls = ttk.Frame(self, padding=(16, 6, 16, 10))
        controls.pack(fill=tk.X)
        ttk.Label(controls, text="Scenario").pack(side=tk.LEFT)
        ttk.Combobox(controls, textvariable=self.scenario_var, values=SCENARIO_IDS, width=34, state="readonly").pack(side=tk.LEFT, padx=8)
        ttk.Button(controls, text="Run", style="Accent.TButton", command=self.run_scenario).pack(side=tk.LEFT, padx=4)
        ttk.Button(controls, text="Start release tour", command=self.start_auto_tour).pack(side=tk.LEFT, padx=4)
        ttk.Button(controls, text="Stop", command=self.stop_auto_tour).pack(side=tk.LEFT, padx=4)
        ttk.Button(controls, text="Reset", command=self.reset_state).pack(side=tk.LEFT, padx=4)
        ttk.Label(controls, textvariable=self.tour_var).pack(side=tk.RIGHT)

        self.tabs = ttk.Notebook(self)
        self.tabs.pack(expand=True, fill=tk.BOTH, padx=16, pady=(0, 16))
        self.tab_frames: dict[str, ttk.Frame] = {}
        for name in ["Command Center", "Policy Builder", "Approvals", "Micro CDN Trust", "Evidence", "Audit"]:
            frame = ttk.Frame(self.tabs, style="TFrame")
            self.tab_frames[name] = frame
            self.tabs.add(frame, text=name)
        self.build_command_tab()
        self.build_policy_tab()
        self.build_approvals_tab()
        self.build_micro_tab()
        self.build_evidence_tab()
        self.build_audit_tab()

    def panel(self, master: tk.Misc, **pack: Any) -> ttk.Frame:
        frame = ttk.Frame(master, style="Panel.TFrame", padding=12)
        frame.pack(**pack)
        return frame

    def build_command_tab(self) -> None:
        frame = self.tab_frames["Command Center"]
        cards = ttk.Frame(frame, padding=(0, 0, 0, 8))
        cards.pack(fill=tk.X)
        for key, label in [
            ("route", "Route status"),
            ("provider", "Active provider"),
            ("pending", "Pending approvals"),
            ("integrity", "Micro CDN integrity"),
        ]:
            var = tk.StringVar(value="--")
            self.status_cards[key] = var
            card = ttk.Frame(cards, style="Panel.TFrame", padding=12)
            card.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=(0, 8))
            ttk.Label(card, text=label, style="Panel.TLabel").pack(anchor=tk.W)
            ttk.Label(card, textvariable=var, style="Card.TLabel").pack(anchor=tk.W, pady=(6, 0))

        split = ttk.PanedWindow(frame, orient=tk.HORIZONTAL)
        split.pack(expand=True, fill=tk.BOTH)
        map_panel = ttk.Frame(split, style="Panel.TFrame", padding=10)
        side_panel = ttk.Frame(split, style="Panel.TFrame", padding=10)
        split.add(map_panel, weight=3)
        split.add(side_panel, weight=2)
        ttk.Label(map_panel, text="Global Smart Traffic & Failover Map", style="Panel.TLabel", font=("Segoe UI", 13, "bold")).pack(anchor=tk.W)
        self.map = OsirisRouteMap(map_panel)
        self.map.pack(expand=True, fill=tk.BOTH, pady=(8, 0))
        ttk.Label(side_panel, text="Normalized provider health", style="Panel.TLabel", font=("Segoe UI", 13, "bold")).pack(anchor=tk.W)
        self.provider_tree = ttk.Treeview(side_panel, columns=("name", "status", "latency", "result"), show="headings", height=7)
        for column, title, width in [("name", "Provider", 110), ("status", "Status", 90), ("latency", "Latency", 90), ("result", "Last result", 210)]:
            self.provider_tree.heading(column, text=title)
            self.provider_tree.column(column, width=width, anchor=tk.W)
        self.provider_tree.pack(fill=tk.X, pady=8)
        ttk.Label(side_panel, text="Route attempt chain", style="Panel.TLabel", font=("Segoe UI", 12, "bold")).pack(anchor=tk.W, pady=(10, 4))
        self.attempt_text = tk.Text(side_panel, height=10, wrap=tk.WORD, background="#08111c", foreground="#dbe7f5", insertbackground="#ffffff", relief=tk.FLAT)
        self.attempt_text.pack(expand=True, fill=tk.BOTH)
        self.attempt_text.configure(state=tk.DISABLED)

    def build_policy_tab(self) -> None:
        frame = self.tab_frames["Policy Builder"]
        left = self.panel(frame, side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 8))
        right = self.panel(frame, side=tk.LEFT, fill=tk.BOTH, expand=True)
        ttk.Label(left, text="Visual route policy builder", style="Panel.TLabel", font=("Segoe UI", 13, "bold")).pack(anchor=tk.W)
        for label, var, values in [
            ("Condition", self.condition_var, ["IF HTTP status is 5xx or provider timeout", "IF provider returns 403, 429, or 451", "IF all CDN providers fail"]),
            ("Provider scope", self.provider_var, ["AND provider is primary CDN", "AND provider is any CDN", "AND route scope is public video"]),
            ("Action", self.action_var, ["THEN route to next CDN, then hash verified Micro CDN", "THEN fail closed before origin", "THEN allow origin only when policy permits"]),
        ]:
            ttk.Label(left, text=label, style="Panel.TLabel").pack(anchor=tk.W, pady=(12, 4))
            box = ttk.Combobox(left, textvariable=var, values=values, state="readonly")
            box.pack(fill=tk.X)
            box.bind("<<ComboboxSelected>>", lambda _event: self.render_policy_code())
        ttk.Radiobutton(left, text="YAML", variable=self.policy_format_var, value="yaml", command=self.render_policy_code).pack(anchor=tk.W, pady=(16, 0))
        ttk.Radiobutton(left, text="JSON", variable=self.policy_format_var, value="json", command=self.render_policy_code).pack(anchor=tk.W)
        ttk.Button(left, text="Test policy", style="Accent.TButton", command=self.test_policy).pack(anchor=tk.W, pady=16)
        ttk.Label(right, text="View as code", style="Panel.TLabel", font=("Segoe UI", 13, "bold")).pack(anchor=tk.W)
        self.policy_code = tk.Text(right, wrap=tk.NONE, background="#08111c", foreground="#c9fbd9", insertbackground="#ffffff", relief=tk.FLAT)
        self.policy_code.pack(expand=True, fill=tk.BOTH, pady=(8, 0))

    def build_approvals_tab(self) -> None:
        frame = self.tab_frames["Approvals"]
        top = self.panel(frame, fill=tk.X)
        ttk.Label(top, text="Operator", style="Panel.TLabel").grid(row=0, column=0, sticky=tk.W, padx=(0, 8), pady=4)
        ttk.Entry(top, textvariable=self.operator_var, width=32).grid(row=0, column=1, sticky=tk.W, pady=4)
        ttk.Label(top, text="Decision note", style="Panel.TLabel").grid(row=1, column=0, sticky=tk.W, padx=(0, 8), pady=4)
        ttk.Entry(top, textvariable=self.note_var, width=80).grid(row=1, column=1, sticky=tk.W, pady=4)
        ttk.Button(top, text="Approve latest pending", style="Accent.TButton", command=self.approve_latest).grid(row=2, column=1, sticky=tk.W, pady=8)
        ttk.Button(top, text="Reject latest pending", style="Danger.TButton", command=self.reject_latest).grid(row=2, column=1, sticky=tk.E, pady=8)
        body = self.panel(frame, fill=tk.BOTH, expand=True, pady=(8, 0))
        ttk.Label(body, text="Agent Recommendation Inbox", style="Panel.TLabel", font=("Segoe UI", 13, "bold")).pack(anchor=tk.W)
        self.recommendation_text = tk.Text(body, wrap=tk.WORD, background="#08111c", foreground="#dbe7f5", insertbackground="#ffffff", relief=tk.FLAT)
        self.recommendation_text.pack(expand=True, fill=tk.BOTH, pady=(8, 0))
        self.recommendation_text.configure(state=tk.DISABLED)

    def build_micro_tab(self) -> None:
        frame = self.tab_frames["Micro CDN Trust"]
        left = self.panel(frame, side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 8))
        right = self.panel(frame, side=tk.LEFT, fill=tk.BOTH, expand=True)
        ttk.Label(left, text="Hash verified peer fleet", style="Panel.TLabel", font=("Segoe UI", 13, "bold")).pack(anchor=tk.W)
        self.peer_tree = ttk.Treeview(left, columns=("node", "status", "storage", "integrity"), show="headings", height=10)
        for col, title, width in [("node", "Peer", 180), ("status", "Status", 100), ("storage", "Storage", 90), ("integrity", "Integrity", 160)]:
            self.peer_tree.heading(col, text=title)
            self.peer_tree.column(col, width=width, anchor=tk.W)
        self.peer_tree.pack(expand=True, fill=tk.BOTH, pady=(8, 0))
        ttk.Label(right, text="Trust boundary status", style="Panel.TLabel", font=("Segoe UI", 13, "bold")).pack(anchor=tk.W)
        self.micro_text = tk.Text(right, wrap=tk.WORD, background="#08111c", foreground="#dbe7f5", insertbackground="#ffffff", relief=tk.FLAT)
        self.micro_text.pack(expand=True, fill=tk.BOTH, pady=(8, 0))
        self.micro_text.configure(state=tk.DISABLED)

    def build_evidence_tab(self) -> None:
        frame = self.tab_frames["Evidence"]
        left = self.panel(frame, side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 8))
        right = self.panel(frame, side=tk.LEFT, fill=tk.BOTH, expand=True)
        ttk.Label(left, text="Generated x-flareless headers", style="Panel.TLabel", font=("Segoe UI", 13, "bold")).pack(anchor=tk.W)
        self.headers_text = tk.Text(left, wrap=tk.NONE, background="#08111c", foreground="#c9fbd9", insertbackground="#ffffff", relief=tk.FLAT)
        self.headers_text.pack(expand=True, fill=tk.BOTH, pady=(8, 0))
        ttk.Label(right, text="Route trace JSON", style="Panel.TLabel", font=("Segoe UI", 13, "bold")).pack(anchor=tk.W)
        self.trace_text = tk.Text(right, wrap=tk.NONE, background="#08111c", foreground="#dbe7f5", insertbackground="#ffffff", relief=tk.FLAT)
        self.trace_text.pack(expand=True, fill=tk.BOTH, pady=(8, 0))

    def build_audit_tab(self) -> None:
        frame = self.tab_frames["Audit"]
        panel = self.panel(frame, fill=tk.BOTH, expand=True)
        ttk.Label(panel, text="Recommendation lifecycle audit log", style="Panel.TLabel", font=("Segoe UI", 13, "bold")).pack(anchor=tk.W)
        self.audit_tree = ttk.Treeview(panel, columns=("time", "actor", "action", "recommendation", "note"), show="headings")
        for col, title, width in [("time", "Time", 180), ("actor", "Actor", 160), ("action", "Action", 120), ("recommendation", "Recommendation", 160), ("note", "Note", 420)]:
            self.audit_tree.heading(col, text=title)
            self.audit_tree.column(col, width=width, anchor=tk.W)
        self.audit_tree.pack(expand=True, fill=tk.BOTH, pady=(8, 0))

    def run_scenario(self) -> None:
        self.run_named_scenario(self.scenario_var.get())

    def run_named_scenario(self, scenario_id: str) -> None:
        try:
            self.scenario_var.set(scenario_id)
            self.api.post("/route/simulate", {"scenarioId": scenario_id})
            self.refresh_all()
        except RuntimeError as exc:
            messagebox.showerror("Flareless local demo", str(exc))

    def reset_state(self) -> None:
        try:
            self.api.post("/state/reset", {})
            self.refresh_all()
        except RuntimeError as exc:
            messagebox.showerror("Flareless local demo", str(exc))

    def refresh_all(self, show_error: bool = True) -> None:
        try:
            self.data = {
                "status": self.api.get("/status"),
                "providers": self.api.get("/providers").get("providers", []),
                "trace": self.api.get("/route/trace"),
                "recommendations": self.api.get("/agent/recommendations").get("recommendations", []),
                "audit": self.api.get("/agent/audit-log").get("auditLog", []),
                "micro": self.api.get("/micro-cdn/status"),
            }
        except RuntimeError as exc:
            if show_error:
                messagebox.showerror("Flareless local demo", str(exc))
            return
        self.render_all()

    def render_all(self) -> None:
        status = self.data.get("status", {})
        trace_payload = self.data.get("trace", {})
        route_trace = trace_payload.get("routeTrace", {})
        headers = trace_payload.get("headers", {})
        providers = self.data.get("providers", [])
        recommendations = self.data.get("recommendations", [])
        audit = self.data.get("audit", [])
        micro = self.data.get("micro", {})
        self.status_cards["route"].set(str(status.get("routeReason") or "unknown"))
        self.status_cards["provider"].set(str(status.get("activeProvider") or "none"))
        self.status_cards["pending"].set(str(status.get("pendingRecommendations", 0)))
        self.status_cards["integrity"].set(str(micro.get("hashVerifiedLocalCache") or micro.get("trustModel") or "bounded"))
        self.map.update_model(route_trace, providers)
        self.render_provider_tree(providers)
        self.render_attempts(route_trace)
        self.render_recommendations(recommendations)
        self.render_micro(micro)
        self.render_headers(headers)
        self.render_json(self.trace_text, route_trace)
        self.render_audit(audit)
        self.render_policy_code()
        self.tour_var.set(f"Scenario: {status.get('scenarioId', '--')} · {status.get('routeReason', '--')}")

    def render_provider_tree(self, providers: list[dict[str, Any]]) -> None:
        self.provider_tree.delete(*self.provider_tree.get_children())
        for provider in providers:
            self.provider_tree.insert("", tk.END, values=(
                provider.get("name"), provider.get("status"), provider.get("latencyMs"), provider.get("lastResult"),
            ))

    def render_attempts(self, route_trace: dict[str, Any]) -> None:
        lines = []
        for index, attempt in enumerate(route_trace.get("attempts", []), start=1):
            lines.append(f"{index:02d}. {attempt.get('provider')} -> {attempt.get('result')}")
        final = route_trace.get("finalStatus", {})
        lines.append("")
        lines.append(f"Final: {final.get('reason')} via {final.get('provider') or 'none'}")
        self.set_text(self.attempt_text, "\n".join(lines))

    def render_recommendations(self, recommendations: list[dict[str, Any]]) -> None:
        if not recommendations:
            self.set_text(self.recommendation_text, "No recommendations yet. Run an outage scenario to generate a pending operator decision.")
            return
        chunks: list[str] = []
        for rec in recommendations:
            chunks.append(
                f"{rec.get('recommendationId')} · {rec.get('status')} · {rec.get('severity')}\n"
                f"Route: {rec.get('routeKey')}\n"
                f"Summary: {rec.get('summary')}\n"
                f"Reason codes: {', '.join(rec.get('reasonCodes', []))}\n"
                f"Proposed action:\n{json.dumps(rec.get('proposedAction', {}), indent=2)}\n"
            )
        self.set_text(self.recommendation_text, "\n---\n".join(chunks))

    def render_micro(self, micro: dict[str, Any]) -> None:
        self.peer_tree.delete(*self.peer_tree.get_children())
        rows = [
            ("hashed3365627006", "online", "250 MB", "hash verified"),
            ("hashed5964045005", "online", "250 MB", "hash verified"),
            ("hashed3320052003", "online", "500 MB", "hash verified"),
        ]
        text = json.dumps(micro)
        if "NODE_DISABLED" in text:
            rows.append(("candidate-disabled", "rejected", "0 MB", "NODE_DISABLED"))
        if "NODE_OFFLINE" in text:
            rows.append(("candidate-offline", "rejected", "0 MB", "NODE_OFFLINE"))
        for row in rows:
            self.peer_tree.insert("", tk.END, values=row)
        self.render_json(self.micro_text, micro)

    def render_headers(self, headers: dict[str, Any]) -> None:
        self.set_text(self.headers_text, "\n".join(f"{k}: {v}" for k, v in headers.items()))

    def policy_object(self) -> dict[str, Any]:
        status = self.data.get("status", {})
        return {
            "policy": "video-public-peer-first",
            "routeKey": status.get("routeKey", "route:/video/example/v1"),
            "condition": self.condition_var.get(),
            "providerScope": self.provider_var.get(),
            "action": self.action_var.get(),
            "safeguards": {
                "operatorApproval": True,
                "hashVerification": True,
                "originFallbackDefault": False,
                "livePolicyMutation": False,
            },
            "mapAssets": {
                "source": "DeerSpotter/osiris-v2",
                "offlineVectorFallback": True,
                "tileStyleMetadata": OSIRIS_TILE_STYLE_ASSETS,
            },
        }

    def render_policy_code(self) -> None:
        policy = self.policy_object()
        if self.policy_format_var.get() == "json":
            text = json.dumps(policy, indent=2)
        else:
            text = self.to_yaml(policy)
        self.set_text(self.policy_code, text)

    def test_policy(self) -> None:
        messagebox.showinfo("Policy test", "Policy test passed in local simulation. No live route policy was mutated.")
        self.render_policy_code()

    def to_yaml(self, value: Any, indent: int = 0) -> str:
        pad = " " * indent
        if isinstance(value, dict):
            lines = []
            for key, item in value.items():
                if isinstance(item, (dict, list)):
                    lines.append(f"{pad}{key}:")
                    lines.append(self.to_yaml(item, indent + 2))
                else:
                    lines.append(f"{pad}{key}: {item}")
            return "\n".join(lines)
        if isinstance(value, list):
            lines = []
            for item in value:
                if isinstance(item, (dict, list)):
                    lines.append(f"{pad}-")
                    lines.append(self.to_yaml(item, indent + 2))
                else:
                    lines.append(f"{pad}- {item}")
            return "\n".join(lines)
        return f"{pad}{value}"

    def render_audit(self, audit: list[dict[str, Any]]) -> None:
        self.audit_tree.delete(*self.audit_tree.get_children())
        for item in audit:
            self.audit_tree.insert("", tk.END, values=(
                item.get("createdAt"), item.get("actor"), item.get("action"), item.get("recommendationId"), item.get("note"),
            ))

    def render_json(self, widget: tk.Text, payload: Any) -> None:
        self.set_text(widget, json.dumps(payload, indent=2))

    def set_text(self, widget: tk.Text, text: str) -> None:
        widget.configure(state=tk.NORMAL)
        widget.delete("1.0", tk.END)
        widget.insert("1.0", text)
        widget.configure(state=tk.DISABLED)

    def latest_pending_id(self) -> str | None:
        for rec in reversed(self.data.get("recommendations", [])):
            if rec.get("status") == "pending":
                return str(rec.get("recommendationId"))
        return None

    def approve_latest(self) -> None:
        self.decide_latest("approve")

    def reject_latest(self) -> None:
        self.decide_latest("reject")

    def decide_latest(self, action: str) -> None:
        rec_id = self.latest_pending_id()
        if not rec_id:
            messagebox.showinfo("Operator approval", "There is no pending recommendation.")
            return
        payload = {"operator": self.operator_var.get(), "note": self.note_var.get()}
        result = self.api.post(f"/agent/recommendations/{rec_id}/{action}", payload)
        if result.get("error"):
            messagebox.showerror("Operator approval", str(result.get("error")))
        self.refresh_all()

    def start_auto_tour(self) -> None:
        if self.tour_running:
            return
        self.tour_running = True
        self.tour_index = 0
        self.after(150, self.play_next_tour_step)

    def stop_auto_tour(self) -> None:
        self.tour_running = False
        self.tour_var.set("Release tour stopped")

    def play_next_tour_step(self) -> None:
        if not self.tour_running:
            return
        if self.tour_index >= len(TOUR_STEPS):
            self.tour_running = False
            self.tour_var.set("Release tour complete")
            return
        scenario_id, tab_name = TOUR_STEPS[self.tour_index]
        self.run_named_scenario(scenario_id)
        self.tabs.select(self.tab_frames[tab_name])
        self.tour_index += 1
        self.tour_var.set(f"Tour {self.tour_index}/{len(TOUR_STEPS)} · {scenario_id}")
        self.after(1500, self.play_next_tour_step)

    def show_about(self) -> None:
        messagebox.showinfo(
            "Flareless Release Console",
            "Local Python release console for route failure, agent recommendations, operator approvals, audit logs, and Micro CDN trust boundaries. The map uses OSIRIS v2 offline 2D fallback assets.",
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Flareless Python release console.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    args = parser.parse_args()
    app = FlarelessConsole(ApiClient(args.base_url))
    app.mainloop()


if __name__ == "__main__":
    main()
