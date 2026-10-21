# Hermes — compatibility evidence, not live certification

Target source: NousResearch/hermes-agent **v0.22.2**, annotated tag object `7b77e29eedd85a8497ce2821448dac7964dc46f6`, commit **`d923a5eb487a17c0a68801bba9ef0f56c81040a8`**. GitHub tag and official source inspected on 2026-10-21. This is a source pin, not an assertion that Hermes is installed in this workspace.

Sources:

- https://github.com/NousResearch/hermes-agent/tree/d923a5eb487a17c0a68801bba9ef0f56c81040a8
- https://github.com/NousResearch/hermes-agent/blob/v0.22.2/gateway/platforms/api_server_runs.py
- https://github.com/NousResearch/hermes-agent/blob/v0.22.2/website/docs/user-guide/features/api-server.md

The adapter uses public `POST /v1/runs`, run status, events, approval, steer, stop and `GET /v1/capabilities`. It requires authenticated loopback Hermes; it does not expose Hermes directly or fall back to the old model loop. Source capability names checked are `run_submission`, `run_status`, `run_events_sse`, `run_stop`, `run_steer`, `run_approval_response`.

Wire details checked in source: native `run_id`, SSE `event`/`seq` and Last-Event-ID; input/instructions/model; Idempotency-Key; approval `{request_id,choice:'once'|'deny'}`; steer `{input}`; stop acknowledgement `stopping`. Capability flags must be boolean true. Generic API access is not proof that a particular tool is approval-gated or budget-enforced.

Stop requests do not immediately prove worker exit; terminal status is authoritative. Steer queues guidance for a supported boundary, not a mutation of an executing tool. Gateway grants no session/always approval. A pending approval must match mission, bound run and exact request; local TTL is at most15minutes from first observation and is further bounded by a valid native deadline. Source replay buffers are temporary, so Gateway persists events, sequence cursors and mapping independently; missing replay is a declared gap.

**Production Runs are currently blocked** even if Hermes health succeeds. A fail-closed execution broker must prove tool restrictions and enforce model/tool cost reservations at controllable boundaries before admission is enabled. `authorizeExecution` is a server dependency used by contract tests; the normal entrypoint does not install a permissive implementation. Observer hooks or prompt instructions are not sufficient enforcement. No private key, model request, real search or paid test was used in this implementation session.

Required next live certification: install the pinned source on supported Python; identify runtime version; configure a private provider; demonstrate read-only tool profile and protected approval before effect; enforce model/tool spending; execute one research run; test multiple approvals, unknown submission, cooperative stop, steer consumption, stream truncation, service restart and actual cost reconciliation. Native delegation should be reused after these gates; role definitions alone do not demonstrate specialist execution.
