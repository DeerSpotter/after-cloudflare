#!/usr/bin/env python3
"""Local Flareless demo server."""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
SCENARIO_DIR = ROOT / "scenarios"
STATE_DIR = ROOT / "state"
STATE_FILE = STATE_DIR / "local-ui-state.json"
TOPOLOGY_FILE = STATE_DIR / "topology-config.json"
TOPOLOGY_SNAPSHOT_FILE = STATE_DIR / "topology-snapshots.json"
CUSTOM_SCENARIO_FILE = STATE_DIR / "custom-scenarios.json"
HEALTH_SETTINGS_FILE = STATE_DIR / "health-settings.json"
PROVIDER_REGISTRY_FILE = STATE_DIR / "provider-registry.json"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765

DEFAULT_TOPOLOGY_CONFIG: dict[str, Any] = {
    "version": 1,
    "nodes": [
        {"id": "client-us", "label": "Client", "kind": "client", "x": 90, "y": 220, "r": 38, "lat": 39.5, "lon": -98.3},
        {"id": "flareless", "label": "Flareless", "kind": "director", "x": 310, "y": 220, "r": 52, "lat": 32.0, "lon": -35.0},
        {"id": "cdn-a", "label": "Cloudflare", "kind": "provider", "x": 550, "y": 92, "r": 42, "lat": 50.1, "lon": -5.1},
        {"id": "cdn-b", "label": "Fastly", "kind": "provider", "x": 550, "y": 220, "r": 42, "lat": 1.3, "lon": 103.8},
        {"id": "cdn-c", "label": "CloudFront", "kind": "provider", "x": 550, "y": 348, "r": 42, "lat": 35.7, "lon": 139.7},
        {"id": "peer-assisted-edge", "label": "Micro CDN", "kind": "peer", "x": 790, "y": 112, "r": 44, "lat": -23.5, "lon": 133.8},
        {"id": "origin", "label": "Origin", "kind": "origin", "x": 790, "y": 220, "r": 44, "lat": 52.5, "lon": 13.4},
    ],
    "links": [
        {"id": "ingress", "from": "client-us", "to": "flareless", "label": "ingress"},
        {"id": "cloudflare", "from": "flareless", "to": "cdn-a", "label": "24 ms"},
        {"id": "fastly", "from": "flareless", "to": "cdn-b", "label": "18 ms"},
        {"id": "cloudfront", "from": "flareless", "to": "cdn-c", "label": "31 ms"},
        {"id": "micro-cdn", "from": "flareless", "to": "peer-assisted-edge", "label": "hash verified"},
        {"id": "origin", "from": "cdn-b", "to": "origin", "label": "origin"},
    ],
}

DEFAULT_HEALTH_SETTINGS: dict[str, Any] = {
    "mode": "local-simulation",
    "providers": {},
    "savedAt": None,
}


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def read_json_file(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def write_json_file(path: Path, payload: Any) -> Any:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def read_saved_custom_scenarios() -> dict[str, dict[str, Any]]:
    data = read_json_file(CUSTOM_SCENARIO_FILE, {"scenarios": {}})
    scenarios = data.get("scenarios") if isinstance(data, dict) else {}
    return scenarios if isinstance(scenarios, dict) else {}


def write_saved_custom_scenarios(scenarios: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return write_json_file(CUSTOM_SCENARIO_FILE, {"savedAt": now_iso(), "scenarios": scenarios})


def save_custom_scenario(scenario: dict[str, Any]) -> dict[str, Any]:
    scenario = normalize_custom_scenario(scenario)
    saved = read_saved_custom_scenarios()
    saved[scenario["id"]] = scenario
    write_saved_custom_scenarios(saved)
    STATE.scenarios[scenario["id"]] = scenario
    return scenario


def delete_custom_scenario(scenario_id: str) -> dict[str, Any]:
    saved = read_saved_custom_scenarios()
    saved.pop(scenario_id, None)
    STATE.scenarios.pop(scenario_id, None)
    write_saved_custom_scenarios(saved)
    return {"deleted": scenario_id, "scenarios": list(saved.values())}


def normalize_custom_scenario(scenario: dict[str, Any]) -> dict[str, Any]:
    scenario = dict(scenario)
    scenario_id = str(scenario.get("id") or f"custom-{int(time.time())}")
    scenario["id"] = scenario_id
    scenario.setdefault("name", "Custom failover chain")
    scenario.setdefault("routeKey", "route:/custom")
    scenario.setdefault("policyId", "custom-ui-policy")
    scenario.setdefault("attempts", [])
    scenario.setdefault("providers", default_providers_from_attempts(scenario.get("attempts", [])))
    scenario.setdefault("finalStatus", infer_final_status(scenario.get("attempts", [])))
    scenario.setdefault(
        "agent",
        {
            "severity": "warning",
            "summary": "Custom scenario generated a review item.",
            "reasonCodes": ["CUSTOM_CHAIN"],
            "action": "REVIEW",
        },
    )
    return scenario


def load_scenarios() -> dict[str, dict[str, Any]]:
    scenarios: dict[str, dict[str, Any]] = {}
    for path in sorted(SCENARIO_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        scenarios[data["id"]] = data
    scenarios.update(read_saved_custom_scenarios())
    return scenarios


def read_persisted_ui_state() -> dict[str, Any]:
    data = read_json_file(STATE_FILE, {"history": [], "events": [], "scenarioSteps": [], "savedAt": None})
    return data if isinstance(data, dict) else {"history": [], "events": [], "scenarioSteps": [], "savedAt": None}


def write_persisted_ui_state(payload: dict[str, Any]) -> dict[str, Any]:
    safe = {
        "history": payload.get("history", []) if isinstance(payload.get("history"), list) else [],
        "events": payload.get("events", []) if isinstance(payload.get("events"), list) else [],
        "scenarioSteps": payload.get("scenarioSteps", []) if isinstance(payload.get("scenarioSteps"), list) else [],
        "savedAt": now_iso(),
    }
    return write_json_file(STATE_FILE, safe)


def read_topology_config() -> dict[str, Any]:
    data = read_json_file(TOPOLOGY_FILE, DEFAULT_TOPOLOGY_CONFIG)
    if isinstance(data, dict) and isinstance(data.get("nodes"), list) and isinstance(data.get("links"), list):
        return data
    return DEFAULT_TOPOLOGY_CONFIG


def write_topology_config(payload: dict[str, Any]) -> dict[str, Any]:
    nodes = payload.get("nodes")
    links = payload.get("links")
    if not isinstance(nodes, list) or not isinstance(links, list):
        raise ValueError("topology config requires nodes and links arrays")
    safe = {"version": int(payload.get("version", 1) or 1), "nodes": nodes, "links": links, "savedAt": now_iso()}
    write_json_file(TOPOLOGY_FILE, safe)
    write_provider_registry_from_topology(safe)
    return safe


def read_topology_snapshots() -> dict[str, Any]:
    data = read_json_file(TOPOLOGY_SNAPSHOT_FILE, {"snapshots": []})
    return data if isinstance(data, dict) and isinstance(data.get("snapshots"), list) else {"snapshots": []}


def write_topology_snapshots(payload: dict[str, Any]) -> dict[str, Any]:
    return write_json_file(TOPOLOGY_SNAPSHOT_FILE, payload)


def create_topology_snapshot(name: str | None = None) -> dict[str, Any]:
    snapshots = read_topology_snapshots()
    snapshot_id = f"topo-{int(time.time())}"
    snapshot = {
        "snapshotId": snapshot_id,
        "name": name or snapshot_id,
        "createdAt": now_iso(),
        "topology": read_topology_config(),
    }
    snapshots["snapshots"].insert(0, snapshot)
    snapshots["snapshots"] = snapshots["snapshots"][:25]
    write_topology_snapshots(snapshots)
    return snapshot


def restore_topology_snapshot(snapshot_id: str) -> dict[str, Any]:
    for snapshot in read_topology_snapshots().get("snapshots", []):
        if snapshot.get("snapshotId") == snapshot_id:
            topology = snapshot.get("topology")
            if not isinstance(topology, dict):
                raise ValueError("snapshot does not contain a topology")
            return write_topology_config(topology)
    raise KeyError("topology snapshot not found")


def read_health_settings() -> dict[str, Any]:
    data = read_json_file(HEALTH_SETTINGS_FILE, DEFAULT_HEALTH_SETTINGS)
    return data if isinstance(data, dict) else DEFAULT_HEALTH_SETTINGS


def write_health_settings(payload: dict[str, Any]) -> dict[str, Any]:
    providers = payload.get("providers")
    if not isinstance(providers, dict):
        raise ValueError("health settings require a providers object")
    safe = {"mode": "local-simulation", "providers": providers, "savedAt": now_iso()}
    return write_json_file(HEALTH_SETTINGS_FILE, safe)


def read_provider_registry() -> dict[str, Any]:
    data = read_json_file(PROVIDER_REGISTRY_FILE, {"providers": []})
    providers = data.get("providers") if isinstance(data, dict) else None
    if isinstance(providers, list) and providers:
        return data
    return write_provider_registry_from_topology(read_topology_config())


def write_provider_registry(payload: dict[str, Any]) -> dict[str, Any]:
    providers = payload.get("providers")
    if not isinstance(providers, list):
        raise ValueError("provider registry requires a providers array")
    safe = {"savedAt": now_iso(), "providers": providers}
    return write_json_file(PROVIDER_REGISTRY_FILE, safe)


def write_provider_registry_from_topology(topology: dict[str, Any]) -> dict[str, Any]:
    providers = []
    for node in topology.get("nodes", []):
        if node.get("kind") == "provider":
            providers.append({"id": node.get("id"), "label": node.get("label", node.get("id")), "kind": "provider"})
    return write_provider_registry({"providers": providers})


def apply_health_settings(providers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    settings = read_health_settings().get("providers", {})
    output = []
    for provider in providers:
        item = dict(provider)
        override = settings.get(item.get("name"), {}) if isinstance(settings, dict) else {}
        if isinstance(override, dict):
            if override.get("enabled") is False:
                item["status"] = "disabled"
                item["lastResult"] = "DISABLED_BY_HEALTH_SETTINGS"
            if override.get("status"):
                item["status"] = override["status"]
            if override.get("latencyMs") not in {None, ""}:
                try:
                    item["latencyMs"] = int(override["latencyMs"])
                except (TypeError, ValueError):
                    pass
            if override.get("lastResult"):
                item["lastResult"] = override["lastResult"]
        output.append(item)
    return output


def build_headers(route_trace: dict[str, Any]) -> dict[str, str]:
    final_status = route_trace.get("finalStatus", {})
    attempts = route_trace.get("attempts", [])
    failure_points = route_trace.get("failurePoints", [])
    return {
        "x-flareless-provider": str(final_status.get("provider") or "none"),
        "x-flareless-reason": str(final_status.get("reason") or "UNKNOWN"),
        "x-flareless-attempts": ",".join(f"{a.get('provider')}:{a.get('result')}" for a in attempts),
        "x-flareless-failure-points": ",".join(f"{i.get('sequence', i.get('order'))}:{i.get('stage', i.get('category'))}:{i.get('provider')}:{i.get('code', i.get('result'))}" for i in failure_points),
        "x-flareless-route-trace": json.dumps(route_trace, separators=(",", ":")),
    }


@dataclass
class DemoState:
    scenarios: dict[str, dict[str, Any]] = field(default_factory=load_scenarios)
    current_scenario_id: str = "healthy-route"
    route_trace: dict[str, Any] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    route_traces: dict[str, dict[str, Any]] = field(default_factory=dict)
    providers: list[dict[str, Any]] = field(default_factory=list)
    recommendations: dict[str, dict[str, Any]] = field(default_factory=dict)
    audit_log: list[dict[str, Any]] = field(default_factory=list)
    recommendation_counter: int = 0
    audit_counter: int = 0
    trace_counter: int = 0

    def __post_init__(self) -> None:
        self.apply_scenario(self.current_scenario_id, create_recommendation=False)

    def reset(self) -> dict[str, Any]:
        self.current_scenario_id = "healthy-route"
        self.route_trace = {}
        self.headers = {}
        self.route_traces = {}
        self.providers = []
        self.recommendations = {}
        self.audit_log = []
        self.recommendation_counter = 0
        self.audit_counter = 0
        self.trace_counter = 0
        return self.apply_scenario(self.current_scenario_id, create_recommendation=False)

    def apply_scenario(self, scenario_id: str, create_recommendation: bool = True) -> dict[str, Any]:
        if scenario_id not in self.scenarios:
            raise KeyError(f"unknown scenario: {scenario_id}")
        scenario = self.scenarios[scenario_id]
        self.current_scenario_id = scenario_id
        self.providers = apply_health_settings(list(scenario.get("providers", [])))
        self.trace_counter += 1
        trace_id = f"trace-{self.trace_counter:06d}"
        self.route_trace = {
            "requestId": trace_id,
            "routeKey": scenario.get("routeKey", "route:/"),
            "policyId": scenario.get("policyId", "unknown-policy"),
            "attempts": scenario.get("attempts", []),
            "failurePoints": scenario.get("failurePoints", []),
            "selectedFallback": scenario.get("selectedFallback"),
            "finalStatus": scenario.get("finalStatus", {}),
            "generatedAt": int(time.time() * 1000),
        }
        self.headers = build_headers(self.route_trace)
        self.route_traces[trace_id] = self.route_trace
        recommendation = self.create_recommendation(scenario) if create_recommendation else None
        return {
            "mode": "demo-simulation",
            "scenarioId": scenario_id,
            "scenario": scenario,
            "story": self.create_story(scenario),
            "headers": self.headers,
            "routeTrace": self.route_trace,
            "providers": self.providers,
            "recommendation": recommendation,
            "recommendationIds": [recommendation["recommendationId"]] if recommendation else [],
        }

    def apply_custom_scenario(self, scenario: dict[str, Any], persist: bool = True) -> dict[str, Any]:
        scenario = save_custom_scenario(scenario) if persist else normalize_custom_scenario(scenario)
        self.scenarios[scenario["id"]] = scenario
        return self.apply_scenario(scenario["id"])

    def create_story(self, scenario: dict[str, Any]) -> list[str]:
        return [f"{a.get('provider')} -> {a.get('result')}" for a in scenario.get("attempts", [])]

    def analyze_route_trace(self, route_trace: dict[str, Any] | None = None) -> dict[str, Any]:
        trace = route_trace or self.route_trace
        attempts = trace.get("attempts", [])
        failures = [a for a in attempts if a.get("result") != "PROVIDER_SUCCESS"]
        final_status = trace.get("finalStatus", {})
        severity = "info" if not failures else "warning"
        if final_status.get("outcome") in {"fallback-blocked", "no-healthy-node", "peer-fallback"}:
            severity = "error"
        return {
            "analysisId": f"analysis-{int(time.time())}",
            "routeTraceId": trace.get("requestId"),
            "severity": severity,
            "summary": self.create_analysis_summary(trace),
            "evidence": [f"{a.get('result')} on {a.get('provider')}" for a in failures] or ["Primary provider succeeded"],
            "proposedAction": {"kind": "policy-annotation", "scope": trace.get("routeKey"), "seconds": 900, "livePolicyMutation": False},
            "livePolicyMutation": False,
        }

    def create_analysis_summary(self, route_trace: dict[str, Any]) -> str:
        final_status = route_trace.get("finalStatus", {})
        return f"Route ended with {final_status.get('reason', 'UNKNOWN')}; selected provider: {final_status.get('provider') or 'no provider'}."

    def create_recommendation(self, scenario: dict[str, Any]) -> dict[str, Any]:
        agent = scenario.get("agent", {})
        self.recommendation_counter += 1
        rec_id = f"rec_{self.recommendation_counter:06d}"
        created_at = now_iso()
        recommendation = {
            "recommendationId": rec_id,
            "requestId": self.route_trace.get("requestId", "unknown-request"),
            "routeKey": self.route_trace.get("routeKey", "route:/"),
            "policyId": self.route_trace.get("policyId", "unknown-policy"),
            "status": "pending",
            "severity": agent.get("severity", "info"),
            "summary": agent.get("summary", "Agent recommendation stored for operator review."),
            "reasonCodes": agent.get("reasonCodes", []),
            "proposedAction": {
                "type": "policy_annotation",
                "scope": "route",
                "routeKey": self.route_trace.get("routeKey", "route:/"),
                "change": {
                    "agentAction": agent.get("action", "OBSERVE_ONLY"),
                    "cooldownProviderNames": [a.get("provider") for a in self.route_trace.get("attempts", []) if a.get("result") != "PROVIDER_SUCCESS"],
                    "ttlSeconds": 900,
                    "livePolicyMutation": False,
                },
            },
            "createdAt": created_at,
            "updatedAt": created_at,
        }
        self.recommendations[rec_id] = recommendation
        self.add_audit_event(rec_id, "flareless-agent", "created", "Recommendation stored as pending operator review.")
        return recommendation

    def decide(self, recommendation_id: str, action: str, operator: str, note: str) -> dict[str, Any]:
        if not operator.strip():
            raise ValueError("operator is required")
        if recommendation_id not in self.recommendations:
            raise KeyError("recommendation not found")
        recommendation = self.recommendations[recommendation_id]
        if recommendation["status"] != "pending":
            raise ValueError(f"recommendation is already {recommendation['status']}")
        before_status = recommendation["status"]
        recommendation["status"] = "approved" if action == "approve" else "rejected"
        recommendation["updatedAt"] = now_iso()
        self.add_audit_event(recommendation_id, operator.strip(), recommendation["status"], note or "No note provided.", before_status, recommendation["status"])
        return recommendation

    def add_audit_event(self, recommendation_id: str, actor: str, action: str, note: str, before_status: str | None = None, after_status: str | None = None) -> dict[str, Any]:
        self.audit_counter += 1
        event = {
            "eventId": f"audit_{self.audit_counter:06d}",
            "recommendationId": recommendation_id,
            "routeTraceId": self.route_trace.get("requestId"),
            "actor": actor,
            "actorType": "agent" if actor == "flareless-agent" else "operator",
            "action": action,
            "beforeStatus": before_status,
            "afterStatus": after_status or ("pending" if action == "created" else action),
            "note": note,
            "createdAt": now_iso(),
        }
        self.audit_log.append(event)
        return event

    def micro_cdn_status(self) -> dict[str, Any]:
        scenario = self.scenarios.get(self.current_scenario_id, {})
        micro = scenario.get("microCdn") if isinstance(scenario, dict) else None
        if isinstance(micro, dict):
            return micro
        return {
            "mode": "local-simulation",
            "hashVerifiedLocalCache": True,
            "trustModel": "hash verified demo cache",
            "peers": [],
            "honestBoundary": "No real peer chunk transfer is performed in this local demo.",
        }

    def status(self) -> dict[str, Any]:
        pending = sum(1 for item in self.recommendations.values() if item["status"] == "pending")
        final_status = self.route_trace.get("finalStatus", {})
        return {
            "name": "Flareless Local Demo Console",
            "mode": "local-simulation",
            "scenarioId": self.current_scenario_id,
            "routeKey": self.route_trace.get("routeKey"),
            "policyId": self.route_trace.get("policyId"),
            "routeStatus": final_status.get("outcome", "unknown"),
            "activeProvider": final_status.get("provider"),
            "routeReason": final_status.get("reason"),
            "pendingRecommendations": pending,
            "routeTraces": len(self.route_traces),
            "auditEvents": len(self.audit_log),
            "honestBoundaries": {
                "realPeerChunkTransfer": False,
                "distributedHealthChecks": False,
                "productionControlPlane": False,
                "detachedManifestSignatures": False,
            },
        }


def default_providers_from_attempts(attempts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    topology_provider_names = [node["id"] for node in read_topology_config().get("nodes", []) if node.get("kind") == "provider"]
    registry_names = [item.get("id") for item in read_provider_registry().get("providers", []) if item.get("id")]
    provider_names = topology_provider_names or registry_names or ["cdn-a", "cdn-b", "cdn-c"]
    seen = [a.get("provider") for a in attempts if a.get("provider")]
    ordered = list(dict.fromkeys(seen + provider_names))
    result_by_provider = {a.get("provider"): a.get("result") for a in attempts}
    providers = [
        {
            "name": name,
            "status": "healthy" if not is_failed_result(result_by_provider.get(name, "")) else "degraded",
            "latencyMs": 18 + index * 9,
            "lastResult": result_by_provider.get(name, "STANDBY"),
        }
        for index, name in enumerate(ordered[:8])
    ]
    return apply_health_settings(providers)


def is_failed_result(result: str) -> bool:
    return any(token in str(result) for token in ["TIMEOUT", "BLOCKED", "ERROR", "OFFLINE", "DISABLED", "NO_HEALTHY", "HTTP_"])


def infer_final_status(attempts: list[dict[str, Any]]) -> dict[str, Any]:
    for attempt in reversed(attempts):
        result = str(attempt.get("result", ""))
        if not is_failed_result(result):
            return {"provider": attempt.get("provider"), "reason": result or "PROVIDER_SUCCESS", "outcome": "success"}
    provider = attempts[-1].get("provider") if attempts else None
    return {"provider": provider, "reason": "ALL_PROVIDERS_FAILED", "outcome": "failed"}


STATE = DemoState()


class DemoHandler(BaseHTTPRequestHandler):
    server_version = "FlarelessLocalDemo/0.1"

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/status": return self.send_json(STATE.status())
        if path == "/scenarios": return self.send_json({"scenarios": list(STATE.scenarios.values())})
        if path == "/scenarios/custom": return self.send_json({"scenarios": list(read_saved_custom_scenarios().values())})
        if path == "/providers": return self.send_json({"providers": apply_health_settings(STATE.providers)})
        if path == "/providers/registry": return self.send_json(read_provider_registry())
        if path == "/health/settings": return self.send_json(read_health_settings())
        if path == "/topology/config": return self.send_json(read_topology_config())
        if path == "/topology/snapshots": return self.send_json(read_topology_snapshots())
        if path == "/route/trace": return self.send_json({"routeTrace": STATE.route_trace, "headers": STATE.headers})
        if path == "/route/traces": return self.send_json({"routeTraces": list(STATE.route_traces.values())})
        if path.startswith("/route/traces/"):
            trace_id = path.rstrip("/").split("/")[-1]
            item = STATE.route_traces.get(trace_id)
            if item is None: return self.send_error_json(404, "route trace not found")
            return self.send_json({"routeTrace": item, "headers": build_headers(item)})
        if path == "/agent/recommendations": return self.send_json({"recommendations": list(STATE.recommendations.values())})
        if path.startswith("/agent/recommendations/"):
            rec_id = path.rstrip("/").split("/")[-1]
            item = STATE.recommendations.get(rec_id)
            if item is None: return self.send_error_json(404, "recommendation not found")
            return self.send_json({"recommendation": item})
        if path == "/agent/audit-log": return self.send_json({"auditLog": STATE.audit_log})
        if path in {"/micro-cdn/status", "/microcdn/status"}: return self.send_json(STATE.micro_cdn_status())
        if path == "/state/local-ui": return self.send_json(read_persisted_ui_state())
        return self.send_error_json(404, "not found")

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        body = self.read_json_body()
        try:
            if path == "/route/simulate": return self.send_json(STATE.apply_scenario(body.get("scenarioId", "healthy-route")))
            if path == "/route/custom-scenario": return self.send_json(STATE.apply_custom_scenario(body.get("scenario") if isinstance(body.get("scenario"), dict) else body))
            if path == "/scenarios/custom": return self.send_json({"scenario": save_custom_scenario(body.get("scenario") if isinstance(body.get("scenario"), dict) else body)}, status=201)
            if path == "/scenarios/custom/run": return self.send_json(STATE.apply_custom_scenario(body.get("scenario") if isinstance(body.get("scenario"), dict) else body))
            if path.startswith("/scenarios/custom/") and path.endswith("/delete"):
                scenario_id = path.rstrip("/").split("/")[-2]
                return self.send_json(delete_custom_scenario(scenario_id))
            if path == "/topology/config": return self.send_json(write_topology_config(body), status=201)
            if path == "/topology/snapshots": return self.send_json({"snapshot": create_topology_snapshot(str(body.get("name") or ""))}, status=201)
            if path.startswith("/topology/snapshots/") and path.endswith("/restore"):
                snapshot_id = path.rstrip("/").split("/")[-2]
                return self.send_json(restore_topology_snapshot(snapshot_id))
            if path == "/health/settings": return self.send_json(write_health_settings(body), status=201)
            if path == "/providers/registry": return self.send_json(write_provider_registry(body), status=201)
            if path == "/agent/cdn-control": return self.send_json(STATE.analyze_route_trace(body.get("routeTrace") if isinstance(body.get("routeTrace"), dict) else None))
            if path == "/agent/recommendations":
                scenario_id = body.get("scenarioId")
                if isinstance(scenario_id, str) and scenario_id in STATE.scenarios:
                    STATE.apply_scenario(scenario_id, create_recommendation=False)
                    recommendation = STATE.create_recommendation(STATE.scenarios[scenario_id])
                else:
                    recommendation = STATE.create_recommendation(STATE.scenarios[STATE.current_scenario_id])
                return self.send_json({"recommendation": recommendation}, status=201)
            if path == "/state/reset": return self.send_json(STATE.reset())
            if path == "/state/local-ui": return self.send_json(write_persisted_ui_state(body), status=201)
            if path.startswith("/agent/recommendations/"):
                parts = path.rstrip("/").split("/")
                if len(parts) == 5 and parts[-1] in {"approve", "reject"}:
                    return self.send_json({"recommendation": STATE.decide(parts[-2], parts[-1], str(body.get("operator", "")), str(body.get("note", "")))})
        except KeyError as exc:
            return self.send_error_json(404, str(exc))
        except ValueError as exc:
            return self.send_error_json(400, str(exc))
        return self.send_error_json(404, "not found")

    def read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length", "0") or "0")
        if length <= 0: return {}
        raw = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(raw)
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}

    def send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        data = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("cache-control", "no-store")
        self.send_header("access-control-allow-origin", "*")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_error_json(self, status: int, message: str) -> None:
        self.send_json({"error": message}, status=status)

    def log_message(self, format: str, *args: Any) -> None:
        print("[local-demo] " + format % args)


def run_server(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), DemoHandler)
    print(f"Flareless local demo server listening on http://{host}:{port}")
    print(f"Local UI history file: {STATE_FILE}")
    print(f"Local topology config file: {TOPOLOGY_FILE}")
    print(f"Local custom scenarios file: {CUSTOM_SCENARIO_FILE}")
    print(f"Local health settings file: {HEALTH_SETTINGS_FILE}")
    return server


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Flareless local demo server.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()
    server = run_server(args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local demo server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
