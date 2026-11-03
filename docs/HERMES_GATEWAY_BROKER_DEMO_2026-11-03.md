# NEXUS ↔ Hermes proposal bridge — experimental, DEMO ONLY (2026-11-03)

> **NO EXTERNAL SIDE EFFECTS**. This branch is based on the signed-device trial, not `main`.
> Never merge or deploy for real payments, mail, workflow execution, or other writes.
> Do **not** call Hermes native `/v1/runs/{id}/approval` to authorize an external effect:
> that would resume a Hermes-owned tool outside NEXUS Broker.

## Trust contract

- NEXUS Gateway owns mission identity, device identity, and the immutable approval envelope.
- Hermes API owns only its internal worker run state (not evidence of external execution).
- Hermes may use approved public/read-only tools *inside a network- and filesystem-restricted container*. Its CLI, filesystem write, browser with authenticated sessions, native MCP writes, and outbound network capability must be restricted at the OS/container layer — merely hiding tools in the prompt does not enforce security.
- A Hermes plugin may use a **separate scoped proposal token** to propose allowlisted operations against an already registered run. It cannot sign, approve, trigger n8n, or read personal action credentials.
- The phone can see pending proposals and reuse `ApprovalReview`, which displays the exact canonical JSON that Secure Enclave signs.
- The Broker verifies the signature, expiration, owner/device, operation allowlist, and durable reservation. The only dispatcher returns `DEMO_ONLY_NO_EFFECT:<digest>`. No n8n/email calls happen.
- No Hermes resume call or native approval forwarding is present: **a signed DEMO receipt does not resume real tool execution**. A future real connector must give the plugin a run-bound, reconciled result and must not bypass the Broker.
- Keep Hermes' model/provider key separate from any account-action credentials. Zero *action credentials* does not mean literally zero credentials.

## Configuration

Optional environment values in `apps/core/.env`:

```sh
HERMES_API_URL=http://127.0.0.1:8642
HERMES_API_SERVER_KEY=<Hermes server-only API key>
HERMES_PROPOSAL_KEY=<distinct 32+ character random proposal-only token>
```

Set all three or none. HTTPS required for remote Hermes, plaintext HTTP allowed only to localhost. Never bundle these in Expo or commit them. **Setting these values does not enable live Hermes run creation**; the current code requires an injected test transport to create a run, protecting against native-tool bypass until an actual isolation proof and reviewed enablement patch.

`HERMES_PROPOSAL_KEY` would be available only to a **trusted plugin process** in a container that has no account credentials. This demo does not implement or install that plugin; it uses an authenticated test request to prove the Gateway contract. Hermes plugin context correlation to the canonical run must be verified before production. A model-supplied run ID is NOT authentication; Gateway checks that it refers to a run it started, but per-run unforgeable plugin capabilities are a future production requirement.

## HTTP API (all fail-closed unless the bridge is configured)

Phone device session endpoints:
- `POST /v1/hermes/runs` with `{requestId,conversationId,input}` is an **offline-tested Hermes Runs API adapter**. Live starts are deliberately rejected until a read-only Hermes profile and OS/container tool isolation are verified. The Gateway owns a `missionId`; the mocked Hermes returns `runId`. The adapter uses a stable idempotency header. Unknown outcomes remain reserved rather than blind retries.
- `GET /v1/hermes/runs/:runId` reads Hermes worker status, not approval authority.
- `GET /v1/hermes/approvals` lists signed-envelope pending actions for this exact phone and owner.
- `POST /v1/hermes/approvals/:actionId/approve` with `{signatureDerBase64}` checks the Secure Enclave signature, but returns `DEMO_VERIFIED_NO_EFFECT` with `execution:NONE`.
- `POST /v1/hermes/approvals/:actionId/reject` records rejection.

Scoped plugin-only endpoints:
- `POST /v1/hermes/bridge/actions` with `{runId,callId,serviceId,operation,destination,arguments}` creates **only** a durable proposal; demo allowlist: `n8n/trigger_workflow` (workflow ID) and `email/send_email` (recipient address).
- `GET /v1/hermes/bridge/actions/:actionId` polls `AWAITING_OWNER`, `REJECTED`, `EXPIRED`, `DEMO_VERIFIED_NO_EFFECT` or `UNKNOWN`. Every status has `execution:NONE`.

Test via `npm test`, `npm run typecheck`, and `npm run typecheck -w @ahmed/mobile`. A green simulator build is **not** a test of a real Secure Enclave key or Face ID.

## Deliberate gaps, never silently enable

1. Live Hermes run creation is **hard-disabled** in this branch, regardless of environment configuration; only mocked transport in offline tests can start a run. No production activation flag exists. Hermes plugin has not been installed or verified, so an actual Hermes tool invocation → Gateway proposal → plugin resume is **not tested**.
2. No real outbound tool execution, no production broker process/container boundary, no n8n integration, no APNs notification, no SSE event cursor.
3. No durable reconciliation for Hermes start responses lost after the remote worker started: the reserved mission intentionally returns unknown instead of retrying beyond Hermes' 24h idempotency retention.
4. Demo action records use a shared SQLite database; production must isolate the credential-bearing dispatcher from the model and prove a unique effect receipt per idempotency key.
5. The old local Core action machine is not yet unified with Hermes missions. Do not call it a single source-of-truth implementation until that migration is complete.
6. `n8n Cloud` is a managed service, **not a private VPS**. It cannot be assumed to share localhost with Hermes or the Gateway.
7. Require negative tests for prompt injection, unexpected tool exposure, arbitrary commands, spoofed run IDs, two-device races, expiry, cancellation, rollback, and server restarts before real writes.

Official API and plugin references:
- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/
- https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins/
- https://hermes-agent.nousresearch.com/docs/user-guide/configuration/
- https://docs.n8n.io/get-started/choose-how-to-use-n8n/
