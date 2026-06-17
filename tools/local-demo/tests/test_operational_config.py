import tempfile
import unittest
from pathlib import Path

import server


class OperationalConfigPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.old_paths = {
            "STATE_DIR": server.STATE_DIR,
            "STATE_FILE": server.STATE_FILE,
            "TOPOLOGY_FILE": server.TOPOLOGY_FILE,
            "TOPOLOGY_SNAPSHOT_FILE": server.TOPOLOGY_SNAPSHOT_FILE,
            "CUSTOM_SCENARIO_FILE": server.CUSTOM_SCENARIO_FILE,
            "HEALTH_SETTINGS_FILE": server.HEALTH_SETTINGS_FILE,
            "PROVIDER_REGISTRY_FILE": server.PROVIDER_REGISTRY_FILE,
        }
        server.STATE_DIR = root
        server.STATE_FILE = root / "local-ui-state.json"
        server.TOPOLOGY_FILE = root / "topology-config.json"
        server.TOPOLOGY_SNAPSHOT_FILE = root / "topology-snapshots.json"
        server.CUSTOM_SCENARIO_FILE = root / "custom-scenarios.json"
        server.HEALTH_SETTINGS_FILE = root / "health-settings.json"
        server.PROVIDER_REGISTRY_FILE = root / "provider-registry.json"

    def tearDown(self):
        for name, value in self.old_paths.items():
            setattr(server, name, value)
        self.tmp.cleanup()

    def test_health_settings_round_trip_and_apply(self):
        saved = server.write_health_settings(
            {"providers": {"cdn-a": {"status": "degraded", "latencyMs": 444, "lastResult": "TIMEOUT"}}}
        )
        self.assertEqual(saved["providers"]["cdn-a"]["status"], "degraded")
        providers = server.apply_health_settings(
            [{"name": "cdn-a", "status": "healthy", "latencyMs": 18, "lastResult": "STANDBY"}]
        )
        self.assertEqual(providers[0]["status"], "degraded")
        self.assertEqual(providers[0]["latencyMs"], 444)
        self.assertEqual(providers[0]["lastResult"], "TIMEOUT")

    def test_custom_scenario_persistence(self):
        scenario = server.save_custom_scenario(
            {
                "id": "custom-test",
                "name": "Custom Test",
                "attempts": [
                    {"provider": "cdn-c", "result": "TIMEOUT"},
                    {"provider": "cdn-a", "result": "PROVIDER_SUCCESS"},
                ],
            }
        )
        self.assertEqual(scenario["id"], "custom-test")
        saved = server.read_saved_custom_scenarios()
        self.assertIn("custom-test", saved)
        self.assertEqual(saved["custom-test"]["finalStatus"]["provider"], "cdn-a")

    def test_topology_snapshot_restore(self):
        original = server.write_topology_config(
            {"version": 1, "nodes": [{"id": "flareless", "label": "Flareless", "kind": "director"}], "links": []}
        )
        snapshot = server.create_topology_snapshot("baseline")
        self.assertEqual(snapshot["topology"]["nodes"][0]["id"], "flareless")
        server.write_topology_config(
            {"version": 1, "nodes": [{"id": "other", "label": "Other", "kind": "provider"}], "links": []}
        )
        restored = server.restore_topology_snapshot(snapshot["snapshotId"])
        self.assertEqual(restored["nodes"], original["nodes"])
        self.assertEqual(restored["links"], original["links"])


if __name__ == "__main__":
    unittest.main()
