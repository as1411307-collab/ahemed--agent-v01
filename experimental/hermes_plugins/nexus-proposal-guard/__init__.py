"""NEXUS inert Hermes plugin: no Gateway secret, no native external effect.

This is intentionally NOT an executable Gateway connector. The real peer-
verified Unix-socket binding has not been implemented in PR #9. No side
effects are possible through this tool handler, including hook failure.
"""

READ_ONLY_TOOLS = frozenset(("web_search", "web_extract", "memory"))


def _blocked(message):
    return {"action": "block", "message": message}


def _dummy_handler(params, **kwargs):
    return '{"error":"NEXUS_DIRECT_ACTION_EXECUTION_DISABLED"}'


def _pre_tool_call(tool_name="", args=None, session_id="", task_id="",
                   tool_call_id="", **kwargs):
    try:
        if tool_name in READ_ONLY_TOOLS:
            return None
        if tool_name != "nexus_propose_action":
            return _blocked("NEXUS_TOOL_NOT_ALLOWLISTED")
        if not isinstance(session_id, str) or not session_id.strip():
            return _blocked("NEXUS_MISSING_TRUSTED_SESSION")
        if not isinstance(tool_call_id, str) or not tool_call_id.strip():
            return _blocked("NEXUS_MISSING_TOOL_CALL_ID")
        # No claim to have recorded a proposal: no attested host transport yet.
        return _blocked("NEXUS_HOST_PEER_BINDING_UNAVAILABLE: No proposal recorded.")
    except Exception:
        # Hermes can continue dispatch after a plugin exception; never raise here.
        return _blocked("NEXUS_CRITICAL_HOOK_FAILURE: Action blocked.")


def register(ctx):
    ctx.register_tool(
        name="nexus_propose_action",
        toolset="nexus-proposal",
        schema={
            "name": "nexus_propose_action",
            "description": "Ask NEXUS to review a proposed operation. Disabled in this demonstration.",
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
