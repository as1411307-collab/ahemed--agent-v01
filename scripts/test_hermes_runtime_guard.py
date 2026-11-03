"""Unit tests for the NEXUS Hermes fail-closed runtime guard (no API keys)."""
import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

import yaml

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "experimental/hermes_plugins/nexus-proposal-guard/__init__.py"
spec = importlib.util.spec_from_file_location("nexus_runtime_guard_test", PLUGIN)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
CONFIG = yaml.safe_load((ROOT / "config/hermes-nexus-demo.yaml").read_text("utf8"))
EXPECTED_NAMES = {"web_search", "web_extract", "memory", "nexus_propose_action"}


class Context:
    def __init__(self):
        self.calls = []

    def register_tool(self, **kwargs):
        self.calls.append(("tool", kwargs))

    def register_hook(self, *args):
        self.calls.append(("hook", args))


class HermesRuntimeGuardTests(unittest.TestCase):
    def evaluate(self, config=None, *, toolsets=None, names=None, mode="off"):
        return guard._assess_runtime(
            copy.deepcopy(CONFIG if config is None else config),
            set(guard.EXPECTED_TOOLSETS if toolsets is None else toolsets),
            set(EXPECTED_NAMES if names is None else names),
            mode,
        )

    def test_checked_in_config_is_strict_and_safe_by_declared_policy(self):
        self.assertEqual(self.evaluate(), (True, "SAFE_DEMO_SURFACE"))

    def test_missing_explicit_api_toolsets_fails(self):
        cfg = copy.deepcopy(CONFIG)
        del cfg["platform_toolsets"]["api_server"]
        self.assertEqual(self.evaluate(cfg)[1], "PLATFORM_TOOLSETS_NOT_EXPLICIT")

    def test_silent_toolset_drift_fails(self):
        cfg = copy.deepcopy(CONFIG)
        cfg["platform_toolsets"]["api_server"].append("delegation")
        self.assertEqual(self.evaluate(cfg)[1], "PLATFORM_TOOLSETS_DRIFT")

    def test_runtime_toolset_drift_fails(self):
        self.assertEqual(
            self.evaluate(toolsets={"web", "memory", "nexus-proposal", "delegation"})[1],
            "EFFECTIVE_TOOLSETS_DRIFT",
        )

    def test_tool_search_reenable_fails(self):
        self.assertEqual(self.evaluate(mode="on")[1], "TOOL_SEARCH_ACTIVE")
        self.assertEqual(self.evaluate(mode="auto")[1], "TOOL_SEARCH_ACTIVE")

    def test_dangerous_tools_exposed_fails_even_if_config_claims_safe(self):
        for extra in ("delegate_task", "execute_code", "terminal", "tool_search", "tool_call", "write_file", "browser_exec"):
            with self.subTest(extra=extra):
                self.assertEqual(
                    self.evaluate(names=EXPECTED_NAMES | {extra})[1],
                    "UNSAFE_ACTIVE_TOOL_EXPOSED",
                )

    def test_disabling_composite_with_core_tools_fails(self):
        cfg = copy.deepcopy(CONFIG)
        cfg["agent"]["disabled_toolsets"].append("hermes-api-server")
        self.assertEqual(self.evaluate(cfg)[1], "COMPOSITE_DISABLE_UNEXPECTED")

    def test_disabled_toolset_configuration_must_be_explicit(self):
        cfg = copy.deepcopy(CONFIG)
        cfg["agent"]["disabled_toolsets"].remove("terminal")
        self.assertEqual(self.evaluate(cfg)[1], "DANGEROUS_TOOLSETS_NOT_DISABLED")

    def test_missing_proposal_stub_fails(self):
        self.assertEqual(
            self.evaluate(names={"web_search", "memory"})[1], "PROPOSAL_STUB_NOT_AVAILABLE"
        )

    def test_guard_missing_from_enabled_plugins_fails(self):
        cfg = copy.deepcopy(CONFIG)
        cfg["plugins"]["enabled"] = []
        self.assertEqual(self.evaluate(cfg)[1], "GUARD_NOT_EXPLICITLY_ENABLED")

    def test_probe_failure_blocks_even_read_only(self):
        with patch.object(guard, "_snapshot_runtime", side_effect=RuntimeError("bad runtime")):
            self.assertEqual(
                guard._pre_tool_call(tool_name="web_search"),
                {"action": "block", "message": "UNSAFE_HERMES_RUNTIME_CONFIG:RUNTIME_PROBE_UNAVAILABLE"},
            )

    def test_drift_blocks_all_tools(self):
        with patch.object(guard, "_assert_runtime", return_value=(False, "TOOL_SEARCH_ACTIVE")):
            self.assertEqual(
                guard._pre_tool_call(tool_name="web_search")["action"], "block"
            )
            self.assertEqual(
                guard._pre_tool_call(tool_name="nexus_propose_action")["action"], "block"
            )

    def test_safe_policy_allows_read_only_but_never_dispatches_proposal(self):
        with patch.object(guard, "_assert_runtime", return_value=(True, "SAFE_DEMO_SURFACE")):
            self.assertIsNone(guard._pre_tool_call(tool_name="web_search"))
            self.assertIsNone(guard._pre_tool_call(tool_name="web_extract"))
            self.assertIsNone(guard._pre_tool_call(tool_name="memory"))
            blocked = guard._pre_tool_call(tool_name="nexus_propose_action",
                                          session_id="sess_12345", tool_call_id="call_12345")
            self.assertEqual(blocked["action"], "block")
            self.assertIn("No proposal recorded", blocked["message"])
            self.assertEqual(
                guard._pre_tool_call(tool_name="delegate_task")["action"], "block"
            )

    def test_register_installs_hook_even_if_assertion_fails(self):
        ctx = Context()
        with patch.object(guard, "_assert_runtime", return_value=(False, "CONFIG_MISSING")):
            guard.register(ctx)
        self.assertEqual([row[0] for row in ctx.calls], ["tool", "hook"])
        self.assertIs(ctx.calls[0][1]["handler"], guard._dummy_handler)
        self.assertEqual(
            guard._dummy_handler({"action": "anything"}),
            '{"error":"NEXUS_DIRECT_ACTION_EXECUTION_DISABLED"}',
        )

    def test_unhandled_runtime_inspection_exception_is_block(self):
        with patch.object(guard, "_assert_runtime", side_effect=Exception("runtime changed")):
            result = guard._pre_tool_call(tool_name="nexus_propose_action")
        self.assertEqual(result["action"], "block")
        self.assertIn("NEXUS_CRITICAL_HOOK_FAILURE", result["message"])


if __name__ == "__main__":
    unittest.main()
