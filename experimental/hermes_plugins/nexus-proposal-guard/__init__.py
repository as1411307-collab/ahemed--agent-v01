"""NEXUS Hermes guard (DEMO ONLY): runtime policy assertion + inert action tool.

This plugin has NO Gateway credentials, socket connection, n8n calls, writes,
or external effects. A failed assertion blocks all intercepted tools.
This does NOT attest process identity or cover a plugin being disabled.
The NEXUS Gateway must keep live execution disabled until it independently
attests the Hermes worker's actual per-run tools, identity and isolation.
"""
from __future__ import annotations

import logging
from typing import Any

LOG = logging.getLogger("nexus.hermes.guard")
PLUGIN_NAME = "nexus-proposal-guard"
PROPOSAL_TOOL = "nexus_propose_action"
EXPECTED_TOOLSETS = frozenset(("web", "memory", "nexus-proposal"))
ALLOWED_TOOL_NAMES = frozenset(("web_search", "web_extract", "memory", PROPOSAL_TOOL))
READ_ONLY_TOOLS = frozenset(("web_search", "web_extract", "memory"))
REQUIRED_DISABLED = frozenset((
    "delegation", "code_execution", "terminal", "file",
    "browser", "cronjob", "computer_use",
))


def _blocked(message: str) -> dict[str, str]:
    return {"action": "block", "message": message}


def _dummy_handler(params: dict[str, Any], **kwargs: Any) -> str:
    # Deliberately has NO network, filesystem or execution code.
    return '{"error":"NEXUS_DIRECT_ACTION_EXECUTION_DISABLED"}'


def _assess_runtime(
    config: Any, selected_toolsets: Any, active_tool_names: Any,
    search_mode: Any,
) -> tuple[bool, str]:
    """Strict, deny-by-default validation of the exposed API-server toolset.

    This validates Hermes' configured/effective tool surface, not the OS
    process sandbox or a specific Session Authority AIAgent's mutated tools.
    """
    if not isinstance(config, dict):
        return False, "CONFIG_MISSING"
    plugins = config.get("plugins")
    enabled_plugins = plugins.get("enabled") if isinstance(plugins, dict) else None
    if not isinstance(enabled_plugins, list) or PLUGIN_NAME not in enabled_plugins:
        return False, "GUARD_NOT_EXPLICITLY_ENABLED"

    platform = config.get("platform_toolsets")
    configured = platform.get("api_server") if isinstance(platform, dict) else None
    if not isinstance(configured, list) or any(not isinstance(x, str) for x in configured):
        return False, "PLATFORM_TOOLSETS_NOT_EXPLICIT"
    if len(configured) != len(EXPECTED_TOOLSETS) or set(configured) != EXPECTED_TOOLSETS:
        return False, "PLATFORM_TOOLSETS_DRIFT"

    if search_mode != "off":
        return False, "TOOL_SEARCH_ACTIVE"

    agent = config.get("agent")
    disabled = agent.get("disabled_toolsets") if isinstance(agent, dict) else None
    if not isinstance(disabled, list) or any(not isinstance(x, str) for x in disabled):
        return False, "DISABLED_TOOLSETS_NOT_EXPLICIT"
    if not REQUIRED_DISABLED.issubset(set(disabled)):
        return False, "DANGEROUS_TOOLSETS_NOT_DISABLED"

    # Avoid a disable-all composite entry such as hermes-api-server or coding.
    # It strips web/memory too, making the configured set misleading.
    if {"hermes-api-server", "hermes-cli", "coding"}.intersection(disabled):
        return False, "COMPOSITE_DISABLE_UNEXPECTED"

    if not isinstance(selected_toolsets, (set, frozenset)):
        return False, "EFFECTIVE_TOOLSETS_UNKNOWN"
    if selected_toolsets != EXPECTED_TOOLSETS:
        return False, "EFFECTIVE_TOOLSETS_DRIFT"

    if not isinstance(active_tool_names, (set, frozenset)):
        return False, "ACTIVE_TOOL_NAMES_UNKNOWN"
    if not active_tool_names or PROPOSAL_TOOL not in active_tool_names:
        return False, "PROPOSAL_STUB_NOT_AVAILABLE"
    if not active_tool_names.issubset(ALLOWED_TOOL_NAMES):
        return False, "UNSAFE_ACTIVE_TOOL_EXPOSED"
    return True, "SAFE_DEMO_SURFACE"


def _snapshot_runtime() -> tuple[Any, Any, Any, Any]:
    """Resolve the active Hermes configuration using its own public Python APIs.

    Never inspect the full process registry: it contains tools registered for
    OTHER platforms even when they are not enabled for the current session.
    """
    from hermes_cli.config import load_config_readonly
    from hermes_cli.tools_config import _get_platform_tools
    from tools.tool_search import load_config_readonly as load_tool_search_config
    from model_tools import get_tool_definitions

    config = load_config_readonly()
    if not isinstance(config, dict):
        raise ValueError("No valid Hermes configuration")
    toolsets = set(_get_platform_tools(config, "api_server"))
    agent = config.get("agent")
    disabled = agent.get("disabled_toolsets") if isinstance(agent, dict) else []
    if not isinstance(disabled, list):
        raise ValueError("disabled_toolsets must be a list")
    definitions = get_tool_definitions(
        enabled_toolsets=sorted(toolsets),
        disabled_toolsets=disabled,
        quiet_mode=True,
    )
    # The one tool that looks like an action MUST still point to our inert
    # handler. Tool name allowlisting alone cannot detect handler replacement.
    from tools.registry import registry
    proposal_entry = registry.get_entry(PROPOSAL_TOOL)
    if (proposal_entry is None or proposal_entry.toolset != "nexus-proposal"
            or proposal_entry.handler is not _dummy_handler):
        raise ValueError("Proposal handler was replaced or is missing")
    names = set()
    for definition in definitions:
        if not isinstance(definition, dict):
            raise ValueError("Malformed Hermes tool schema")
        fn = definition.get("function")
        name = fn.get("name") if isinstance(fn, dict) else None
        if not isinstance(name, str):
            raise ValueError("Unknown Hermes tool schema shape")
        names.add(name)
    return config, toolsets, names, load_tool_search_config().enabled


def _assert_runtime() -> tuple[bool, str]:
    try:
        return _assess_runtime(*_snapshot_runtime())
    except Exception:
        # Unknown/missing Hermes APIs and malformed config always fail closed.
        return False, "RUNTIME_PROBE_UNAVAILABLE"


def _pre_tool_call(tool_name: str = "", args: Any = None, session_id: Any = "",
                   task_id: Any = "", tool_call_id: Any = "", **kwargs: Any) -> dict[str, str] | None:
    try:
        safe, reason = _assert_runtime()
        if not safe:
            return _blocked("UNSAFE_HERMES_RUNTIME_CONFIG:" + reason)
        if tool_name in READ_ONLY_TOOLS:
            return None
        if tool_name != PROPOSAL_TOOL:
            return _blocked("NEXUS_TOOL_NOT_ALLOWLISTED")
        if not isinstance(session_id, str) or not session_id.strip():
            return _blocked("NEXUS_MISSING_TRUSTED_SESSION")
        if not isinstance(tool_call_id, str) or not tool_call_id.strip():
            return _blocked("NEXUS_MISSING_TOOL_CALL_ID")
        # IMPORTANT: Hook has not yet been wired to a peer-verified Gateway.
        # Never report "proposal recorded" or claim an iPhone approval exists.
        return _blocked("NEXUS_HOST_PEER_BINDING_UNAVAILABLE: No proposal recorded.")
    except Exception:
        # Hermes may continue to the handler on an unhandled hook exception.
        return _blocked("NEXUS_CRITICAL_HOOK_FAILURE: Action blocked.")


def register(ctx: Any) -> None:
    # Register the inert handler and the block-first hook BEFORE checking config.
    # Raising on startup could unload the hook and turn a guard into fail-open.
    ctx.register_tool(
        name=PROPOSAL_TOOL,
        toolset="nexus-proposal",
        schema={
            "name": PROPOSAL_TOOL,
            "description": "NEXUS proposal only; permanently inert in the demo.",
            "parameters": {
                "type": "object",
                "properties": {
                    "serviceId": {"type": "string"},
                    "operation": {"type": "string"},
                    "destination": {"type": "string"},
                    "arguments": {"type": "object"},
                },
                "required": ["serviceId", "operation", "destination", "arguments"],
            },
        },
        handler=_dummy_handler,
    )
    ctx.register_hook("pre_tool_call", _pre_tool_call)
    safe, reason = _assert_runtime()
    if not safe:
        LOG.error("UNSAFE_HERMES_RUNTIME_CONFIG:%s; all intercepted tools are blocked", reason)
    else:
        LOG.info("NEXUS demo Hermes tool-surface assertion passed; no live Gateway transport")
