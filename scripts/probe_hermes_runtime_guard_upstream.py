#!/usr/bin/env python3
"""Integration test against real, PINNED upstream Hermes plugin loader/tool resolver.

No real model calls, no Gateway requests, no live external actions.
Requires path to a checkout of NousResearch/hermes-agent as argv[1].
"""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import sys
import tempfile
import time

import yaml

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = Path(sys.argv[1]).resolve()
HOME = Path(tempfile.mkdtemp(prefix="nexus-hermes-runtime-policy-"))
shutil.copytree(
    ROOT / "experimental/hermes_plugins/nexus-proposal-guard",
    HOME / "plugins" / "nexus-proposal-guard",
)
CONFIG = HOME / "config.yaml"
config = yaml.safe_load((ROOT / "config/hermes-nexus-demo.yaml").read_text("utf8"))
config["model"] = {
    "default": "offline-probe-only",
    "provider": "custom",
    "base_url": "http://127.0.0.1:1/v1",
}
CONFIG.write_text(yaml.safe_dump(config), "utf8")
os.environ["HERMES_HOME"] = str(HOME)
os.environ["HERMES_SAFE_WORKER"] = "0"
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
os.environ["OPENAI_API_KEY"] = "not-a-real-key"
sys.path.insert(0, str(UPSTREAM))

from hermes_cli import plugins  # noqa: E402
from hermes_cli.tools_config import _get_platform_tools  # noqa: E402
from hermes_cli.config import load_config_readonly  # noqa: E402
from model_tools import get_tool_definitions  # noqa: E402

plugins.discover_plugins(force=True)
manager = plugins.get_plugin_manager()
assert "nexus-proposal-guard" in manager._plugins, "external plugin was not loaded"
cfg = load_config_readonly()
selected = _get_platform_tools(cfg, "api_server")
names = {d["function"]["name"] for d in get_tool_definitions(
    enabled_toolsets=sorted(selected),
    disabled_toolsets=cfg["agent"]["disabled_toolsets"],
    quiet_mode=True,
)}
print("NEXUS_UPSTREAM_SELECTED_TOOLSETS=" + repr(sorted(selected)), flush=True)
print("NEXUS_UPSTREAM_EXPOSED_TOOL_NAMES=" + repr(sorted(names)), flush=True)

# A correct startup assertion must permit read-only web search, while the
# proposal Hook still forbids ALL execution because no trusted socket exists.
allowed, _ = plugins._dispatch_pre_tool_call_hooks(
    "web_search", {}, session_id="sess_probed_001", tool_call_id="call_probed_001"
)
assert allowed is None, f"read-only unexpected refusal: {allowed!r}"
blocked, _ = plugins._dispatch_pre_tool_call_hooks(
    "nexus_propose_action", {"arguments": {}},
    session_id="sess_probed_001", tool_call_id="call_probed_002",
)
assert blocked is not None and "NEXUS_HOST_PEER_BINDING_UNAVAILABLE" in blocked, blocked

# A real on-disk config drift MUST block even pre-approved read-only tools.
config["tools"]["tool_search"]["enabled"] = "on"
time.sleep(.05)
CONFIG.write_text(yaml.safe_dump(config), "utf8")
bad, _ = plugins._dispatch_pre_tool_call_hooks(
    "web_search", {}, session_id="sess_probed_001", tool_call_id="call_probed_003"
)
assert bad is not None and "UNSAFE_HERMES_RUNTIME_CONFIG" in bad, bad
print("NEXUS_UPSTREAM_DRIFT_RESULT=FAIL_CLOSED", flush=True)
print("NEXUS_UPSTREAM_RUNTIME_GUARD_RESULT=PASS", flush=True)
