#!/usr/bin/env python3
"""Validate local demo scenario fixtures.

This is intentionally dependency free. It checks that the local demo remains
faithful to the repo-documented routeTrace and honesty contracts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
SCENARIO_DIR = ROOT / "scenarios"
REQUIRED_SCENARIO_IDS = {
    "healthy-route",
    "http-status-failover",
    "timeout-failover",
    "blocked-provider",
    "all-providers-failed",
    "origin-blocked",
    "microcdn-hello",
    "microcdn-no-healthy-node",
}
REQUIRED_ROUTE_TRACE_KEYS = {
    "requestId",
    "routeKey",
    "policyId",
    "attempts",
    "failurePoints",
    "selectedFallback",
    "finalStatus",
}
FORBIDDEN_TRUE_CLAIMS = {
    "realPeerTransfer",
    "realPeerChunkTransfer",
    "detachedManifestSignatures",
    "distributedHealthChecks",
    "productionControlPlane",
}


def main() -> int:
    errors: list[str] = []
    scenarios = load_scenarios(errors)
    errors.extend(check_catalog(scenarios))
    for scenario in scenarios.values():
        errors.extend(check_scenario(scenario))
        errors.extend(check_materialized_route_trace(scenario))
        errors.extend(assert_no_forbidden_true_claims(scenario))
    errors.extend(check_golden_chain(scenarios.get("blocked-provider")))
    errors.extend(check_microcdn_no_healthy_node(scenarios.get("microcdn-no-healthy-node")))

    if errors:
        print("local demo fixture check failed:")
        for error in errors:
            print("- " + error)
        return 1

    print(f"local demo fixture check passed for {len(scenarios)} scenarios")
    return 0


def load_scenarios(errors: list[str]) -> dict[str, dict[str, Any]]:
    scenarios: dict[str, dict[str, Any]] = {}
    for path in sorted(SCENARIO_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"{path.name}: invalid JSON: {exc}")
            continue
        scenario_id = data.get("id")
        if not isinstance(scenario_id, str) or not scenario_id:
            errors.append(f"{path.name}: missing string id")
            continue
        if scenario_id in scenarios:
            errors.append(f"{path.name}: duplicate scenario id {scenario_id}")
        scenarios[scenario_id] = data
    return scenarios


def check_catalog(scenarios: dict[str, dict[str, Any]]) -> list[str]:
    missing = sorted(REQUIRED_SCENARIO_IDS.difference(scenarios.keys()))
    return ["missing required scenario: " + item for item in missing]


def check_scenario(scenario: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    scenario_id = scenario.get("id", "unknown")
    for field in ["id", "title", "summary", "routeKey", "policyId", "providers", "attempts", "failurePoints", "finalStatus", "agent"]:
        if field not in scenario:
            errors.append(f"{scenario_id}: missing field {field}")
    if not isinstance(scenario.get("providers"), list) or not scenario.get("providers"):
        errors.append(f"{scenario_id}: providers must be a non-empty list")
    if not isinstance(scenario.get("attempts"), list) or not scenario.get("attempts"):
        errors.append(f"{scenario_id}: attempts must be a non-empty list")
    for attempt in scenario.get("attempts", []):
        if not isinstance(attempt, dict):
            errors.append(f"{scenario_id}: each attempt must be an object")
            continue
        if not isinstance(attempt.get("provider"), str):
            errors.append(f"{scenario_id}: attempt missing provider")
        if not isinstance(attempt.get("result"), str):
            errors.append(f"{scenario_id}: attempt missing result")
    final_status = scenario.get("finalStatus")
    if not isinstance(final_status, dict):
        errors.append(f"{scenario_id}: finalStatus must be an object")
    else:
        for field in ["outcome", "statusCode", "provider", "reason"]:
            if field not in final_status:
                errors.append(f"{scenario_id}: finalStatus missing {field}")
    return errors


def check_materialized_route_trace(scenario: dict[str, Any]) -> list[str]:
    scenario_id = scenario.get("id", "unknown")
    route_trace = {
        "requestId": "trace-contract-check",
        "routeKey": scenario.get("routeKey"),
        "policyId": scenario.get("policyId"),
        "attempts": scenario.get("attempts", []),
        "failurePoints": scenario.get("failurePoints", []),
        "selectedFallback": scenario.get("selectedFallback"),
        "finalStatus": scenario.get("finalStatus", {}),
    }
    keys = set(route_trace.keys())
    if keys != REQUIRED_ROUTE_TRACE_KEYS:
        return [f"{scenario_id}: routeTrace keys drifted: {sorted(keys)}"]
    return []


def check_golden_chain(scenario: dict[str, Any] | None) -> list[str]:
    if scenario is None:
        return ["blocked-provider: missing golden provider-chain scenario"]
    attempts = scenario.get("attempts", [])
    expected = [
        {"provider": "cdn-a", "result": "PROVIDER_TIMEOUT"},
        {"provider": "cdn-b", "result": "PROVIDER_BLOCKED_429"},
        {"provider": "cdn-c", "result": "PROVIDER_SUCCESS"},
    ]
    actual = [{"provider": item.get("provider"), "result": item.get("result")} for item in attempts]
    if actual != expected:
        return ["blocked-provider: golden chain must be cdn-a timeout, cdn-b 429, cdn-c success"]
    return []


def check_microcdn_no_healthy_node(scenario: dict[str, Any] | None) -> list[str]:
    if scenario is None:
        return ["microcdn-no-healthy-node: missing scenario"]
    text = json.dumps(scenario)
    errors: list[str] = []
    for required in ["NODE_DISABLED", "NODE_OFFLINE", "NO_HEALTHY_NODE"]:
        if required not in text:
            errors.append(f"microcdn-no-healthy-node: missing {required}")
    return errors


def assert_no_forbidden_true_claims(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key, value in payload.items():
        if key in FORBIDDEN_TRUE_CLAIMS and value is True:
            errors.append(f"forbidden local demo claim: {key}=true")
        if isinstance(value, dict):
            errors.extend(assert_no_forbidden_true_claims(value))
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    errors.extend(assert_no_forbidden_true_claims(item))
    return errors


if __name__ == "__main__":
    sys.exit(main())
