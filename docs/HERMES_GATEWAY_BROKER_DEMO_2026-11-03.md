# NEXUS / Hermes Broker signed-proposal trial — security review (2026-11-03)

**Status: DRAFT / DEMO_ONLY_NO_EFFECT.** This experimental PR is based on the iPhone signed-device trial PR #8, not on `main`. No network action credentials, no n8n/SMTP execution and no Hermes live run starts are allowed. The Hermes API in tests is mocked. Do not merge for production or treat a simulator build as physical Secure Enclave proof.

## Boundaries

1. Gateway is authoritative for owner, mission, action intent, approvals and external effects. Hermes owns internal run progress/history only.
2. The proposal-only token `HERMES_PROPOSAL_KEY` cannot sign or dispatch tools but **is not a host-attested per-run capability**. The API body includes `sessionId` and the Gateway binds it to one active `mission_runs` record; a compromised holder of the static token could still impersonate another allowed session. No production effect path is enabled. A peer-verified local bridge is a mandatory production gate.
3. A demonstration Workflow Registry in the Gateway contains *only* `workflow_demo_001`; its human-readable display name and effects declare that NO real n8n workflow is connected. An unknown workflow ID or an unexpected argument is denied. The demo registry is **not a verified n8n Cloud configuration digest**.
4. Browser, shell, file write, credentialed browsing and native MCP write tools must be disabled by real OS/container isolation before any live Hermes Run is permitted. System prompts or tool descriptions are not a boundary. Live run starts are hard-blocked in code even if credentials are configured.
5. Broker signs `AHMED-ACTION-APPROVAL-V1\n` + canonical JSON of the full `ActionEnvelope`. Hermes `approvalContext.intentHash` binds the signed preview to a durable `LockedActionIntent` containing the owner, mission/run/call IDs, arguments, frozen human summary/effects/risk and proposal deadline. `canonicalPayloadHash` is the retained wire name for the *ephemeral* signing-envelope hash; it is not the stable intent hash.

## Two domain-separated hashes and the signed approval

```typescript
const intentHash = sha256("AHMED-LOCKED-INTENT-V1\\n" + canonicalize(lockedIntent));
const signingEnvelopeHash = sha256("AHMED-SIGNING-ENVELOPE-V1\\n" +
  canonicalize(envelopeWithoutCanonicalPayloadHash));
const ownerSignature = p256_sign("AHMED-ACTION-APPROVAL-V1\\n" + canonicalize(envelope));
```

`lockedIntent` is written once with `frozenRegistrySpec` and its stable
`effectIdempotencyKey`, `proposalCreatedAt` and `proposalDeadlineAt`.
Each new 90-second preview carries the same `approvalContext.intentHash`, but new
`actionId`, nonce and expiry; the Broker's preview/action ID remains separate
from the proposal ID. On preview and approval, the Gateway checks that its
CURRENT local registry still matches the frozen snapshot; a change denies
approval (`REGISTRY_CHANGED`) and must not be silently accepted.

**Migration:** Existing V2 proposal rows have no `intent_hash` and are
`LEGACY_QUARANTINED`. The old `payload_digest` column remains for schema
compatibility but stores the new stable hash on newly recorded proposals. No
old proposal is upgraded by guessing its registry meaning.

## Single pending proposal, atomic session binding

- A mission is inserted into `hermes_launches` and `mission_runs` with
  `STARTING` in the same SQLite transaction, BEFORE the Hermes HTTP request.
- A partial unique index on `mission_runs(session_id)` forbids a second
  `STARTING`, `ACTIVE` or `AWAITING_SIGNATURE` row for the same session.
- `POST /v1/runs` returns a `run_id`; a transaction binds it while changing
  `STARTING -> ACTIVE`. A Hook arriving before this binding must fail closed.
- The plugin proposal API requires `sessionId`; an optional `runId` is
  accepted only as a consistency assertion. The Gateway resolves the run by its
  reserved session, **not by a model-supplied run ID**.
- Each proposal is handled in a synchronous `better-sqlite3` transaction.
  First, a repeat `(run_id,call_id)` is compared against the OLD LOCKED INPUT;
  an identical retry returns the original proposal ID without incrementing
  quota. Reusing the call ID with changed parameters sets `REVOKED`.
- A new call is accepted only from `ACTIVE`, with one atomic update:
  `proposals_count + 1` and `state='AWAITING_SIGNATURE'`, followed by a frozen
  intent insert and audit **within the same database transaction**. A sibling
  parallel sensitive call is explicitly rejected. No tool handler is ever
  allowed to dispatch an external effect in this demo.
- `AWAITING_SIGNATURE` is NOT cleared automatically after owner approval;
  async Hermes continuation/worker-stop attestation is not implemented.

**Provenance:** The isolated
[Hermes Session Authority + standalone Plugin CI run](https://github.com/as1411307-collab/ahemed--agent-v01/actions/runs/41683933337)
observed `session_id=task_id` for an explicitly supplied session ID,
not the returned `run_id`. The complete simulation used a fake local LLM;
the live Hermes-to-NEXUS peer identity channel remains unimplemented.

## Runtime restriction template (not installed automatically)

`config/hermes-nexus-demo.yaml` switches **Tool Search OFF** and declares a
restricted `api_server` toolset (`web`, `memory`, `nexus-proposal`), plus
`agent.disabled_toolsets` for `delegation` (subagents), code, shell,
file writes, browser, cron and GUI tools. **Do not put `hermes-api-server`,
`hermes-cli` or `coding` in the disabled list**: Hermes subtracts the
overlapping core tools, inadvertently stripping permitted search/memory.

The independent `experimental/hermes_plugins/nexus-proposal-guard/` Plugin
now runs a **fail-closed runtime self-assertion** during `register()` and
before *each* `pre_tool_call`. It reads Hermes' active config and
`_get_platform_tools(..., "api_server")`, the resolved
`get_tool_definitions(...)` names, and Tool Search's actual enabled mode.
It requires the exact three explicit toolsets, guard-plugin opt-in,
dangerous disabled lists, `tool_search=off`, an inert proposal handler and
NO extra active tool names. If any inspection errors or drifts, it returns
`{"action":"block","message":"UNSAFE_HERMES_RUNTIME_CONFIG:..."}`,
even for nominal read-only tools.

**Limits of self-assertion:** A disabled/unloaded Plugin cannot run its own
hook; another plugin or runtime that bypasses hooks cannot be governed by this
assertion. A modified agent's per-run tool list may differ from an independent
`get_tool_definitions` check; only a trusted supervisor/Gateway can attest the
actual worker after launch. A Unix socket with same-UID peer checks or a
long-lived shared environment key alone cannot establish strong process
identity on macOS. Production requires an isolated OS account/container plus
a verified process/channel identity and a Gateway-owned fail-closed launch
policy. No claim of a live attested Plugin handshake is made in this PR.

The handler is deliberately inert: **this is NOT a connected Gateway Plugin**.
Hermes API live starts remain blocked until actual worker tooling,
OS/container restrictions and a trusted local peer channel are verified.

CI adds `scripts/test_hermes_runtime_guard.py` (YAML policy drift tests)
and `scripts/probe_hermes_runtime_guard_upstream.py` (pinned official
Hermes Plugin and tool-discovery integration; no model calls).

## Previous V2 digest (obsolete, shown only for comparison)



```typescript
function canonicalPayloadHash(envelope: ActionEnvelope): string {
  const {canonicalPayloadHash: _ignored, ...intent} = envelope;
  return sha256("AHMED-ACTION-INTENT-V1\n" + canonicalize(intent));
}
function approvalBytes(envelope: ActionEnvelope): Buffer {
  return utf8("AHMED-ACTION-APPROVAL-V1\n" + canonicalize(envelope));
}
```

Thus changing **any byte** of the canonical fields, notably `runId`, `callId`, `arguments`, registry semantics, `issuedAt`, `expiresAt` or the hash, invalidates the phone's signature. The broker also recomputes the intent hash before accepting the signature.

`canonicalPayloadHash` is a digest, **not itself an authorization secret**. A hash is not a signature. The P-256 signature over the entire canonical envelope is what establishes owner authorization. The stable `effectIdempotencyKey: nexus_<UUID>` is an identifier; the future executor must enforce it durably.

## Async owner approval — no held HTTP connection

- Demo proposal endpoint `POST /v1/hermes/bridge/actions` accepts `{sessionId,runId?,callId,serviceId,operation,destination,arguments}` from the bearer-authenticated test adapter. Returns **202** with a stable proposal ID and two-hour owner deadline. It does NOT block waiting for Face ID or provide a run-scoped credential.
- Plugin `GET /v1/hermes/bridge/actions/:proposalId` polls for `PENDING_USER_SIGNATURE_ON_IPHONE`, `REJECTED`, `EXPIRED`, `OUTCOME_UNKNOWN` or `DEMO_VERIFIED_NO_EFFECT`.
- iPhone `GET /v1/hermes/approvals` shows Gateway-resolved plain-language semantics. It does NOT receive a stale signable envelope.
- iPhone `POST /v1/hermes/approvals/:proposalId/preview` generates or reuses a **90-second** signed envelope. Opening after 30 or 60 minutes still works if the proposal deadline remains valid. If that envelope expires, opening another preview generates a fresh Broker action ID, nonce and expiry, while the immutable `intentHash` stays unchanged; the old signature cannot approve the new preview.
- iPhone `POST /v1/hermes/approvals/:proposalId/approve` validates the signature of **the latest active envelope**. The Broker dispatcher is a no-effect receipt generator, never sends a webhook or email. Approval recorded by Gateway and exposed to the plugin as `DEMO_VERIFIED_NO_EFFECT`.
- Rejected/verified records are persisted into `hermes_continuation_outbox` for a future external-delivery mechanism. This outbox **does not auto-send** anything.
- **No actual Hermes async continuation implemented.** Hermes docs distinguish a run's lifecycle from a new turn in an existing session. For a real system, once an external action is verified, use a durable outbox with a new, idempotent, authorized run in the SAME Hermes session (after verifying session ownership), or an official future continuation capability; do not claim a finished run was magically resumed. No `/v1/runs/{id}/approval` is called to execute a sensitive tool.

## Future n8n Cloud reconciliation (NOT implemented)

1. A signed Gateway-approved intent names a **verified** workflow registration, actual immutable workflow configuration fingerprint and exact side effects. If the remote workflow changed, demand reapproval. The current registry is explicitly unverified.
2. Broker sends a stable `effectIdempotencyKey` in both header and body. An outbound HTTP timeout is **OUTCOME_UNKNOWN**, not a failure safe to retry.
3. A first n8n step must claim that key using an **atomic unique constraint in a durable shared store**, not merely read-then-insert or a workflow variable. Repeated deliveries find the same effect record. The downstream service itself must support idempotency if possible.
4. A final n8n step signs an authenticated callback containing `effectIdempotencyKey`, workflow execution ID, status and evidence. Prefer mTLS/HMAC or another scoped authenticated channel, verify timestamp/nonce, match approved intent and workflow registry, never trust a raw callback. The response loss case also needs authenticated reconciliation against the authoritative effect store and upstream system.
5. `VERIFIED_SUCCESS` means the specific external effect was confirmed, not merely that n8n workflow returned HTTP 200. `VERIFIED_FAILED` requires evidence that the effect did not happen; otherwise keep `OUTCOME_UNKNOWN`.
6. The n8n Executions API and custom saved execution data may support correlation **depending on n8n Cloud plan/config**, but do **not** assume that a generic executions lookup can atomically deduplicate or reliably search arbitrary idempotency keys.

n8n Cloud is a managed service, not the user's privately managed Linux VPS.

## Verification

```sh
npm test
npm run typecheck
npm run typecheck -w @ahmed/mobile
```

The Hermes bridge tests simulate a 30-minute wait, a 60-minute wait, signature snapshot expiry and renewal, tampering with run/call/arguments/expiry, unknown workflow IDs, replay, rejection, an uncertain Broker state, and device-session renewal (session bearer is only 5 minutes). They use a software P-256 key, not hardware Face ID. The new tests also enforce the first-wins parallel proposal gate, stable intent hash across previews, modified same-call revocation, registry meaning drift refusal and legacy-row quarantine.

## Remaining production blockers

- Working, peer-authenticated Hermes-to-Gateway local plugin channel; the supplied plugin is intentionally inert and the current bearer/HTTP bridge is NOT run-scoped. Attestation of effective read-only toolset and OS/container restrictions is mandatory; currently demo only.
- n8n Cloud workflow integrity verification, scoped credentials, isolated Broker process, authenticated callbacks and **effect reconciliation**.
- Client async event stream/APNs and durable continuation dispatcher with confirmed Hermes session ownership.
- Crash-recovery and two-device/cross-run race tests across separate processes, secure administrative re-enrollment, storage encryption, backup/restore, bounded resource use and a real iPhone device test.
- Pre-existing Core action state machine must be reconciled with Hermes proposal projection before claiming a single authoritative mission ledger.

Official references:
- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://docs.n8n.io/workflows/executions/all-executions/
- https://docs.n8n.io/hosting/securing/security-audit/
