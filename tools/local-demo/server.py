#!/usr/bin/env python3
"""Local Flareless demo server.

This is a small standard library HTTP server for the v0.1 local demo console.
It intentionally simulates the Flareless control flow locally instead of claiming to be
production infrastructure.
"""

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
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def load_scenarios() -> dict[str, dict[str, Any]]:
    scenarios: dict[str, dict[str, Any]] = {}
    for path in sorted(SCENARIO_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        scenarios[data["id"]] = data
    return scenarios


@dataclass
class DemoState:
    scenarios: dict[str, dict[str, Any]] = field(default_factory=load_scenarios)
    current_scenario_id: str = "healthy-route"
    route_trace: dict[str, Any] = field(default_factory=dict)
    providers: list[dict[str, Any]] = field(default_factory=list)
    recommendations: dict[str, dict[str, Any]] = field(default_factory=dict)
    audit_log: list[dict[str, Any]] = field(default_factory=list)
    recommendation_counter: int = 0
    audit_counter: int = 0

    def __post_init__(self) -> None:
        self.apply_scenario(self.current_scenario_id, create_recommendation=False)

    def apply_scenario(self, scenario_id: str, create_recommendation: bool = True) -> dict[str, Any]:
        if scenario_id not in self.scenarios:
            raise KeyError(f"unknown scenario: {scenario_id}")

        scenario = self.scenarios[scenario_id]
        self.current_scenario_id = scenario_id
        self.providers = list(scenario.get("providers", []))
        self.route_trace = {
            "requestId": f"trace-{int(time.time())}",
            "routeKey": scenario.get("routeKey", "route:/"),
            "policyId": scenario.get("policyId", "unknown-policy"),
            "attempts": scenario.get("attempts", []),
            "failurePoints": scenario.get("failurePoints", []),
            "selectedFallback": scenario.get("selectedFallback"),
            "finalStatus": scenario.get("finalStatus", {}),
            "generatedAt": int(time.time() * 1000),
        }

        recommendation = None
        if create_recommendation:
            recommendation = self.create_recommendation(scenario)

        return {
            "scenario": scenario,
            "routeTrace": self.route_trace,
            "providers": self.providers,
            "recommendation": recommendation,
        }

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
                    "cooldownProviderNames": [
                        attempt.get("provider")
                        for attempt in self.route_trace.get("attempts", [])
                        if attempt.get("result") != "PROVIDER_SUCCESS"
                    ],
                    "ttlSeconds": 900,
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
        recommendation["status"] = "approved" if action == "approve" else "rejected"
        recommendation["updatedAt"] = now_iso()
        self.add_audit_event(recommendation_id, operator.strip(), recommendation["status"], note or "No note provided.")
        return recommendation

    def add_audit_event(self, recommendation_id: str, actor: str, action: str, note: str) -> dict[str, Any]:
        self.audit_counter += 1
        event = {
            "eventId": f"audit_{self.audit_counter:06d}",
            "recommendationId": recommendation_id,
            "actor": actor,
            "action": action,
            "note": note,
            "createdAt": now_iso(),
        }
        self.audit_log.append(event)
        return event

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
            "auditEvents": len(self.audit_log),
            "honestBoundaries": {
                "realPeerChunkTransfer": False,
                "distributedHealthChecks": False,
                "productionControlPlane": False,
                "detachedManifestSignatures": False,
            },
        }


STATE = DemoState()


class DemoHandler(BaseHTTPRequestHandler):
    server_version = "FlarelessLocalDemo/0.1"

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/status":
            return self.send_json(STATE.status())
        if path == "/scenarios":
            return self.send_json({"scenarios": list(STATE.scenarios.values())})
        if path == "/providers":
            return self.send_json({"providers": STATE.providers})
        if path == "/route/trace":
            return self.send_json({"routeTrace": STATE.route_trace})
        if path == "/agent/recommendations":
            return self.send_json({"recommendations": list(STATE.recommendations.values())})
        if path.startswith("/agent/recommendations/"):
            rec_id = path.rstrip("/").split("/")[-1]
            item = STATE.recommendations.get(rec_id)
            if item is None:
                return self.send_error_json(404, "recommendation not found")
            return self.send_json({"recommendation": item})
        if path == "/agent/audit-log":
            return self.send_json({"auditLog": STATE.audit_log})
        if path == "/micro-cdn/status":
            return self.send_json({
                "trustModel": "MVP implemented",
                "approvalManifestSchema": "implemented",
                "approvalReasonCodes": "implemented",
                "hashVerifiedLocalCache": "implemented",
                "realPeerTransfer": "not implemented",
                "detachedManifestSignatures": "not implemented",
            })
        return self.send_error_json(404, "not found")

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        body = self.read_json_body()
        try:
            if path == "/route/simulate":
                scenario_id = body.get("scenarioId", "healthy-route")
                return self.send_json(STATE.apply_scenario(scenario_id))
            if path.startswith("/agent/recommendations/"):
                parts = path.rstrip("/").split("/")
                if len(parts) == 5 and parts[-1] in {"approve", "reject"}:
                    recommendation = STATE.decide(
                        recommendation_id=parts[-2],
                        action=parts[-1],
                        operator=str(body.get("operator", "")),
                        note=str(body.get("note", "")),
                    )
                    return self.send_json({"recommendation": recommendation})
        except KeyError as exc:
            return self.send_error_json(404, str(exc))
        except ValueError as exc:
            return self.send_error_json(400, str(exc))
        return self.send_error_json(404, "not found")

    def read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length", "0") or "0")
        if length <= 0:
            return {}
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
    print("Open the client with: python tools/local-demo/client.py")
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
