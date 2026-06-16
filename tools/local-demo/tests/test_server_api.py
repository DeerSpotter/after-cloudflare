#!/usr/bin/env python3
"""Contract tests for the local demo server."""

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT / "server.py"

spec = importlib.util.spec_from_file_location("local_demo_server", SERVER_PATH)
server = importlib.util.module_from_spec(spec)
assert spec is not None and spec.loader is not None
sys.modules[spec.name] = server
spec.loader.exec_module(server)


class LocalDemoServerTests(unittest.TestCase):
    def setUp(self) -> None:
        server.STATE = server.DemoState()

    def test_status_has_honest_boundaries(self) -> None:
        status = server.STATE.status()
        self.assertEqual(status["mode"], "local-simulation")
        self.assertFalse(status["honestBoundaries"]["realPeerChunkTransfer"])
        self.assertFalse(status["honestBoundaries"]["distributedHealthChecks"])
        self.assertFalse(status["honestBoundaries"]["productionControlPlane"])
        self.assertFalse(status["honestBoundaries"]["detachedManifestSignatures"])

    def test_route_trace_top_level_shape_is_stable(self) -> None:
        server.STATE.apply_scenario("blocked-provider")
        route_trace = server.STATE.route_trace
        self.assertEqual(
            set(route_trace.keys()),
            {"requestId", "routeKey", "policyId", "attempts", "failurePoints", "selectedFallback", "finalStatus", "generatedAt"},
        )
        for key in ["requestId", "routeKey", "policyId", "attempts", "failurePoints", "selectedFallback", "finalStatus"]:
            self.assertIn(key, route_trace)

    def test_golden_chain_matches_readme_evidence(self) -> None:
        server.STATE.apply_scenario("blocked-provider")
        attempts = [
            {"provider": item["provider"], "result": item["result"]}
            for item in server.STATE.route_trace["attempts"]
        ]
        self.assertEqual(
            attempts,
            [
                {"provider": "cdn-a", "result": "PROVIDER_TIMEOUT"},
                {"provider": "cdn-b", "result": "PROVIDER_BLOCKED_429"},
                {"provider": "cdn-c", "result": "PROVIDER_SUCCESS"},
            ],
        )
        self.assertEqual(server.STATE.route_trace["finalStatus"]["provider"], "cdn-c")
        self.assertEqual(server.STATE.route_trace["finalStatus"]["reason"], "PROVIDER_TIMEOUT_FAILOVER")
        self.assertEqual(server.STATE.headers["x-flareless-provider"], "cdn-c")
        self.assertIn("cdn-b:PROVIDER_BLOCKED_429", server.STATE.headers["x-flareless-attempts"])

    def test_creates_pending_recommendation_when_scenario_runs(self) -> None:
        result = server.STATE.apply_scenario("timeout-failover")
        recommendation = result["recommendation"]
        self.assertIsNotNone(recommendation)
        self.assertEqual(recommendation["status"], "pending")
        self.assertEqual(recommendation["routeKey"], "route:/video/example/v1")
        self.assertEqual(len(server.STATE.audit_log), 1)
        self.assertEqual(server.STATE.audit_log[0]["action"], "created")

    def test_approve_requires_operator_name(self) -> None:
        result = server.STATE.apply_scenario("timeout-failover")
        rec_id = result["recommendation"]["recommendationId"]
        with self.assertRaises(ValueError):
            server.STATE.decide(rec_id, "approve", "", "missing operator")

    def test_approve_appends_audit_event(self) -> None:
        result = server.STATE.apply_scenario("timeout-failover")
        rec_id = result["recommendation"]["recommendationId"]
        updated = server.STATE.decide(rec_id, "approve", "local-operator", "Approved for demo route only.")
        self.assertEqual(updated["status"], "approved")
        self.assertEqual(len(server.STATE.audit_log), 2)
        self.assertEqual(server.STATE.audit_log[-1]["action"], "approved")
        self.assertEqual(server.STATE.audit_log[-1]["actor"], "local-operator")
        self.assertEqual(server.STATE.audit_log[-1]["beforeStatus"], "pending")
        self.assertEqual(server.STATE.audit_log[-1]["afterStatus"], "approved")

    def test_reject_appends_audit_event(self) -> None:
        result = server.STATE.apply_scenario("timeout-failover")
        rec_id = result["recommendation"]["recommendationId"]
        updated = server.STATE.decide(rec_id, "reject", "local-operator", "Provider recovered.")
        self.assertEqual(updated["status"], "rejected")
        self.assertEqual(server.STATE.audit_log[-1]["action"], "rejected")

    def test_double_decision_is_rejected(self) -> None:
        result = server.STATE.apply_scenario("timeout-failover")
        rec_id = result["recommendation"]["recommendationId"]
        server.STATE.decide(rec_id, "approve", "local-operator", "Approved.")
        with self.assertRaises(ValueError):
            server.STATE.decide(rec_id, "reject", "local-operator", "Too late.")

    def test_agent_cdn_control_compatibility_analysis(self) -> None:
        server.STATE.apply_scenario("blocked-provider")
        analysis = server.STATE.analyze_route_trace()
        self.assertEqual(analysis["routeTraceId"], server.STATE.route_trace["requestId"])
        self.assertEqual(analysis["livePolicyMutation"], False)
        self.assertIn("PROVIDER_TIMEOUT on cdn-a", analysis["evidence"])

    def test_route_traces_are_listed_and_readable(self) -> None:
        first = server.STATE.apply_scenario("timeout-failover")["routeTrace"]
        second = server.STATE.apply_scenario("http-status-failover")["routeTrace"]
        self.assertIn(first["requestId"], server.STATE.route_traces)
        self.assertIn(second["requestId"], server.STATE.route_traces)
        self.assertEqual(server.STATE.route_traces[second["requestId"]]["finalStatus"]["reason"], "PROVIDER_BLOCKED_FAILOVER")

    def test_reset_state_clears_recommendations_and_audit(self) -> None:
        server.STATE.apply_scenario("timeout-failover")
        self.assertGreater(len(server.STATE.recommendations), 0)
        server.STATE.reset()
        self.assertEqual(len(server.STATE.recommendations), 0)
        self.assertEqual(len(server.STATE.audit_log), 0)
        self.assertEqual(server.STATE.current_scenario_id, "healthy-route")

    def test_micro_cdn_status_does_not_claim_peer_transfer(self) -> None:
        payload = server.STATE.micro_cdn_status()
        self.assertEqual(payload["realPeerTransfer"], "not implemented")
        self.assertEqual(payload["detachedManifestSignatures"], "not implemented")

    def test_microcdn_no_healthy_node_fixture_has_rejections(self) -> None:
        server.STATE.apply_scenario("microcdn-no-healthy-node")
        payload = server.STATE.micro_cdn_status()
        self.assertEqual(payload["routeResult"]["reason"], "NO_HEALTHY_NODE")
        text = json.dumps(payload)
        self.assertIn("NODE_DISABLED", text)
        self.assertIn("NODE_OFFLINE", text)

    def test_fixture_json_loads(self) -> None:
        for path in sorted((ROOT / "scenarios").glob("*.json")):
            with self.subTest(path=path.name):
                data = json.loads(path.read_text(encoding="utf-8"))
                self.assertIn("id", data)
                self.assertIn("attempts", data)
                self.assertIn("finalStatus", data)


if __name__ == "__main__":
    unittest.main()
