#!/usr/bin/env python3
"""Tkinter client for the Flareless local demo server."""

from __future__ import annotations

import argparse
import json
import tkinter as tk
from tkinter import ttk, messagebox
from typing import Any
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen

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
    ("healthy-route", "Dashboard"),
    ("http-status-failover", "Providers"),
    ("blocked-provider", "Route Trace"),
    ("all-providers-failed", "Agent Recommendation"),
    ("origin-blocked", "Operator Approval"),
    ("microcdn-hello", "Micro CDN Status"),
    ("microcdn-no-healthy-node", "Micro CDN Status"),
    ("timeout-failover", "Audit Log"),
]
TAB_NAMES = [
    "Dashboard",
    "Providers",
    "Route Trace",
    "Agent Recommendation",
    "Operator Approval",
    "Audit Log",
    "Micro CDN Status",
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


class FlarelessConsole(tk.Tk):
    def __init__(self, api: ApiClient) -> None:
        super().__init__()
        self.api = api
        self.title("Flareless Local Demo Console")
        self.geometry("1180x760")
        self.minsize(1000, 680)
        self.recommendation_ids: list[str] = []
        self.tour_running = False
        self.tour_index = 0

        self.status_var = tk.StringVar(value="Disconnected")
        self.scenario_var = tk.StringVar(value="healthy-route")
        self.operator_var = tk.StringVar(value="local-operator")
        self.note_var = tk.StringVar(value="Approved for demo route only. Keep TTL short.")
        self.playback_var = tk.DoubleVar(value=0)
        self.tour_label_var = tk.StringVar(value="Tour idle")

        self.build_menu()
        self.build_layout()
        self.refresh_all()

    def build_menu(self) -> None:
        menu_bar = tk.Menu(self)

        file_menu = tk.Menu(menu_bar, tearoff=False)
        file_menu.add_command(label="Reset state", command=self.reset_state)
        file_menu.add_command(label="Refresh", command=self.refresh_all)
        file_menu.add_separator()
        file_menu.add_command(label="Exit", command=self.destroy)
        menu_bar.add_cascade(label="File", menu=file_menu)

        scenario_menu = tk.Menu(menu_bar, tearoff=False)
        for scenario_id in SCENARIO_IDS:
            scenario_menu.add_command(
                label=scenario_id,
                command=lambda item=scenario_id: self.run_named_scenario(item),
            )
        menu_bar.add_cascade(label="Scenarios", menu=scenario_menu)

        action_menu = tk.Menu(menu_bar, tearoff=False)
        action_menu.add_command(label="Run selected scenario", command=self.run_scenario)
        action_menu.add_command(label="Start auto tour", command=self.start_auto_tour)
        action_menu.add_command(label="Stop auto tour", command=self.stop_auto_tour)
        action_menu.add_separator()
        action_menu.add_command(label="Approve latest pending recommendation", command=self.approve_latest)
        action_menu.add_command(label="Reject latest pending recommendation", command=self.reject_latest)
        menu_bar.add_cascade(label="Actions", menu=action_menu)

        view_menu = tk.Menu(menu_bar, tearoff=False)
        for index, tab_name in enumerate(TAB_NAMES):
            view_menu.add_command(label=tab_name, command=lambda item=index: self.tabs.select(item))
        menu_bar.add_cascade(label="View", menu=view_menu)

        help_menu = tk.Menu(menu_bar, tearoff=False)
        help_menu.add_command(label="About local demo", command=self.show_about)
        menu_bar.add_cascade(label="Help", menu=help_menu)

        self.config(menu=menu_bar)

    def build_layout(self) -> None:
        top = ttk.Frame(self, padding=10)
        top.pack(fill=tk.X)

        ttk.Label(top, text="Flareless Local Demo Console", font=("TkDefaultFont", 16, "bold")).pack(side=tk.LEFT)
        ttk.Label(top, textvariable=self.status_var).pack(side=tk.RIGHT)

        controls = ttk.Frame(self, padding=(10, 0, 10, 6))
        controls.pack(fill=tk.X)
        ttk.Label(controls, text="Scenario").pack(side=tk.LEFT)
        self.scenario_box = ttk.Combobox(
            controls,
            textvariable=self.scenario_var,
            values=SCENARIO_IDS,
            width=34,
            state="readonly",
        )
        self.scenario_box.pack(side=tk.LEFT, padx=6)
        ttk.Button(controls, text="Run scenario", command=self.run_scenario).pack(side=tk.LEFT, padx=4)
        ttk.Button(controls, text="Start auto tour", command=self.start_auto_tour).pack(side=tk.LEFT, padx=4)
        ttk.Button(controls, text="Stop", command=self.stop_auto_tour).pack(side=tk.LEFT, padx=4)
        ttk.Button(controls, text="Reset state", command=self.reset_state).pack(side=tk.LEFT, padx=4)

        playback = ttk.Frame(self, padding=(10, 0, 10, 10))
        playback.pack(fill=tk.X)
        ttk.Label(playback, textvariable=self.tour_label_var, width=44).pack(side=tk.LEFT)
        self.progress_bar = ttk.Progressbar(
            playback,
            variable=self.playback_var,
            maximum=100,
            mode="determinate",
        )
        self.progress_bar.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=8)

        self.tabs = ttk.Notebook(self)
        self.tabs.pack(expand=True, fill=tk.BOTH, padx=10, pady=(0, 10))
        self.tabs.enable_traversal()

        self.dashboard_tab = ttk.Frame(self.tabs)
        self.providers_tab = ttk.Frame(self.tabs)
        self.trace_tab = ttk.Frame(self.tabs)
        self.recommendation_tab = ttk.Frame(self.tabs)
        self.approval_tab = ttk.Frame(self.tabs)
        self.audit_tab = ttk.Frame(self.tabs)
        self.micro_cdn_tab = ttk.Frame(self.tabs)

        self.tabs.add(self.dashboard_tab, text="Dashboard")
        self.tabs.add(self.providers_tab, text="Providers")
        self.tabs.add(self.trace_tab, text="Route Trace")
        self.tabs.add(self.recommendation_tab, text="Agent Recommendation")
        self.tabs.add(self.approval_tab, text="Operator Approval")
        self.tabs.add(self.audit_tab, text="Audit Log")
        self.tabs.add(self.micro_cdn_tab, text="Micro CDN Status")

        self.build_dashboard_tab()
        self.build_providers_tab()
        self.build_trace_tab()
        self.build_recommendation_tab()
        self.build_approval_tab()
        self.build_audit_tab()
        self.build_micro_cdn_tab()

    def build_dashboard_tab(self) -> None:
        frame = ttk.Frame(self.dashboard_tab, padding=14)
        frame.pack(expand=True, fill=tk.BOTH)
        self.dashboard_text = tk.Text(frame, height=18, wrap=tk.WORD)
        self.dashboard_text.pack(expand=True, fill=tk.BOTH)
        self.dashboard_text.configure(state=tk.DISABLED)

    def build_providers_tab(self) -> None:
        frame = ttk.Frame(self.providers_tab, padding=14)
        frame.pack(expand=True, fill=tk.BOTH)
        columns = ("name", "status", "latency", "result", "scope")
        self.providers_tree = ttk.Treeview(frame, columns=columns, show="headings")
        for column, title in zip(columns, ["Provider", "Status", "Latency ms", "Last result", "Health scope"]):
            self.providers_tree.heading(column, text=title)
            self.providers_tree.column(column, width=160, anchor=tk.W)
        self.providers_tree.pack(expand=True, fill=tk.BOTH)

    def build_trace_tab(self) -> None:
        frame = ttk.Frame(self.trace_tab, padding=14)
        frame.pack(expand=True, fill=tk.BOTH)
        self.trace_text = tk.Text(frame, wrap=tk.NONE)
        self.trace_text.pack(expand=True, fill=tk.BOTH)
        self.trace_text.configure(state=tk.DISABLED)

    def build_recommendation_tab(self) -> None:
        frame = ttk.Frame(self.recommendation_tab, padding=14)
        frame.pack(expand=True, fill=tk.BOTH)
        self.recommendation_text = tk.Text(frame, wrap=tk.WORD)
        self.recommendation_text.pack(expand=True, fill=tk.BOTH)
        self.recommendation_text.configure(state=tk.DISABLED)

    def build_approval_tab(self) -> None:
        frame = ttk.Frame(self.approval_tab, padding=14)
        frame.pack(fill=tk.X)
        ttk.Label(frame, text="Operator").grid(row=0, column=0, sticky=tk.W, pady=4)
        ttk.Entry(frame, textvariable=self.operator_var, width=48).grid(row=0, column=1, sticky=tk.W, pady=4)
        ttk.Label(frame, text="Decision note").grid(row=1, column=0, sticky=tk.W, pady=4)
        ttk.Entry(frame, textvariable=self.note_var, width=80).grid(row=1, column=1, sticky=tk.W, pady=4)
        ttk.Button(frame, text="Approve latest pending recommendation", command=self.approve_latest).grid(row=2, column=1, sticky=tk.W, pady=10)
        ttk.Button(frame, text="Reject latest pending recommendation", command=self.reject_latest).grid(row=2, column=1, sticky=tk.E, pady=10)

        explanation = ttk.Label(
            self.approval_tab,
            text="Guardrail: approval records an operator decision and audit event. It does not mutate live route policy yet.",
            padding=14,
        )
        explanation.pack(fill=tk.X)

    def build_audit_tab(self) -> None:
        frame = ttk.Frame(self.audit_tab, padding=14)
        frame.pack(expand=True, fill=tk.BOTH)
        columns = ("time", "actor", "action", "recommendation", "note")
        self.audit_tree = ttk.Treeview(frame, columns=columns, show="headings")
        for column, title in zip(columns, ["Time", "Actor", "Action", "Recommendation", "Note"]):
            self.audit_tree.heading(column, text=title)
            self.audit_tree.column(column, width=180, anchor=tk.W)
        self.audit_tree.pack(expand=True, fill=tk.BOTH)

    def build_micro_cdn_tab(self) -> None:
        frame = ttk.Frame(self.micro_cdn_tab, padding=14)
        frame.pack(expand=True, fill=tk.BOTH)
        self.micro_cdn_text = tk.Text(frame, wrap=tk.WORD)
        self.micro_cdn_text.pack(expand=True, fill=tk.BOTH)
        self.micro_cdn_text.configure(state=tk.DISABLED)

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
            self.playback_var.set(0)
            self.tour_label_var.set("Tour idle")
            self.refresh_all()
        except RuntimeError as exc:
            messagebox.showerror("Flareless local demo", str(exc))

    def start_auto_tour(self) -> None:
        if self.tour_running:
            return
        self.tour_running = True
        self.tour_index = 0
        self.playback_var.set(0)
        self.tour_label_var.set("Starting auto tour")
        self.after(150, self.play_next_tour_step)

    def stop_auto_tour(self) -> None:
        self.tour_running = False
        self.tour_label_var.set("Tour stopped")

    def play_next_tour_step(self) -> None:
        if not self.tour_running:
            return
        if self.tour_index >= len(TOUR_STEPS):
            self.tour_running = False
            self.playback_var.set(100)
            self.tour_label_var.set("Tour complete")
            return

        scenario_id, tab_name = TOUR_STEPS[self.tour_index]
        self.run_named_scenario(scenario_id)
        self.select_tab_by_name(tab_name)
        self.tour_index += 1
        percent = int((self.tour_index / len(TOUR_STEPS)) * 100)
        self.playback_var.set(percent)
        self.tour_label_var.set(f"Tour step {self.tour_index}/{len(TOUR_STEPS)}: {scenario_id} -> {tab_name}")
        self.after(1400, self.play_next_tour_step)

    def select_tab_by_name(self, tab_name: str) -> None:
        try:
            index = TAB_NAMES.index(tab_name)
        except ValueError:
            index = 0
        self.tabs.select(index)

    def refresh_all(self) -> None:
        try:
            status = self.api.get("/status")
            providers = self.api.get("/providers")
            trace = self.api.get("/route/trace")
            recommendations = self.api.get("/agent/recommendations")
            audit = self.api.get("/agent/audit-log")
            micro = self.api.get("/micro-cdn/status")
        except RuntimeError as exc:
            self.status_var.set("Server unavailable")
            messagebox.showerror("Flareless local demo", str(exc))
            return

        self.status_var.set(f"Connected: {status.get('scenarioId')} | {status.get('routeReason')}")
        self.render_dashboard(status)
        self.render_providers(providers.get("providers", []))
        self.render_json(self.trace_text, trace)
        self.render_recommendations(recommendations.get("recommendations", []))
        self.render_audit(audit.get("auditLog", []))
        self.render_json(self.micro_cdn_text, micro)

    def render_dashboard(self, status: dict[str, Any]) -> None:
        lines = [
            "Flareless local prototype console",
            "",
            f"Scenario: {status.get('scenarioId')}",
            f"Route key: {status.get('routeKey')}",
            f"Policy: {status.get('policyId')}",
            f"Route status: {status.get('routeStatus')}",
            f"Active provider: {status.get('activeProvider') or 'none'}",
            f"Route reason: {status.get('routeReason')}",
            f"Route traces: {status.get('routeTraces')}",
            f"Pending recommendations: {status.get('pendingRecommendations')}",
            f"Audit events: {status.get('auditEvents')}",
            "",
            "Honest boundaries:",
        ]
        for key, value in status.get("honestBoundaries", {}).items():
            lines.append(f"- {key}: {value}")
        self.set_text(self.dashboard_text, "\n".join(lines))

    def render_providers(self, providers: list[dict[str, Any]]) -> None:
        self.providers_tree.delete(*self.providers_tree.get_children())
        for provider in providers:
            self.providers_tree.insert(
                "",
                tk.END,
                values=(
                    provider.get("name"),
                    provider.get("status"),
                    provider.get("latencyMs"),
                    provider.get("lastResult"),
                    provider.get("healthScope"),
                ),
            )

    def render_recommendations(self, recommendations: list[dict[str, Any]]) -> None:
        self.recommendation_ids = [item.get("recommendationId", "") for item in recommendations]
        if not recommendations:
            self.set_text(self.recommendation_text, "No recommendations yet. Run a scenario first.")
            return
        latest = recommendations[-1]
        lines = [
            f"Recommendation ID: {latest.get('recommendationId')}",
            f"Status: {latest.get('status')}",
            f"Severity: {latest.get('severity')}",
            f"Route key: {latest.get('routeKey')}",
            f"Policy: {latest.get('policyId')}",
            "",
            "Summary:",
            str(latest.get("summary")),
            "",
            "Reason codes:",
            *[f"- {code}" for code in latest.get("reasonCodes", [])],
            "",
            "Proposed action:",
            json.dumps(latest.get("proposedAction", {}), indent=2),
        ]
        self.set_text(self.recommendation_text, "\n".join(lines))

    def render_audit(self, events: list[dict[str, Any]]) -> None:
        self.audit_tree.delete(*self.audit_tree.get_children())
        for event in events:
            self.audit_tree.insert(
                "",
                tk.END,
                values=(event.get("createdAt"), event.get("actor"), event.get("action"), event.get("recommendationId"), event.get("note")),
            )

    def approve_latest(self) -> None:
        self.decide_latest("approve")

    def reject_latest(self) -> None:
        self.decide_latest("reject")

    def decide_latest(self, action: str) -> None:
        try:
            recs = self.api.get("/agent/recommendations").get("recommendations", [])
            pending = [item for item in recs if item.get("status") == "pending"]
            if not pending:
                messagebox.showinfo("Flareless local demo", "No pending recommendation to decide.")
                return
            rec_id = pending[-1]["recommendationId"]
            response = self.api.post(
                f"/agent/recommendations/{rec_id}/{action}",
                {"operator": self.operator_var.get(), "note": self.note_var.get()},
            )
            if "error" in response:
                messagebox.showerror("Flareless local demo", response["error"])
            self.refresh_all()
        except RuntimeError as exc:
            messagebox.showerror("Flareless local demo", str(exc))

    def show_about(self) -> None:
        messagebox.showinfo(
            "About Flareless Local Demo",
            "Flareless Local Demo Console\n\n"
            "A local prototype for failure aware route control, agent assisted recommendations, "
            "operator approval, and audit logging.\n\n"
            "It does not implement production peer transfer, distributed health checks, "
            "detached signatures, or a durable production control plane.",
        )

    def render_json(self, widget: tk.Text, data: Any) -> None:
        self.set_text(widget, json.dumps(data, indent=2))

    def set_text(self, widget: tk.Text, text: str) -> None:
        widget.configure(state=tk.NORMAL)
        widget.delete("1.0", tk.END)
        widget.insert(tk.END, text)
        widget.configure(state=tk.DISABLED)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Flareless local demo client.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    args = parser.parse_args()
    app = FlarelessConsole(ApiClient(args.base_url))
    app.mainloop()


if __name__ == "__main__":
    main()
