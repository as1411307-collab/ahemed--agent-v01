# NEXUS / Hermes Broker signed-proposal trial — security review (2026-11-03)

**Status: DRAFT / DEMO_ONLY_NO_EFFECT.** This experimental PR is based on the iPhone signed-device trial PR #8, not on `main`. No network action credentials, no n8n/SMTP execution and no Hermes live run starts are allowed. The Hermes API in tests is mocked. Do not merge for production or treat a simulator build as physical Secure Enclave proof.

## Boundaries

1. Gateway is authoritative for owner, mission, action intent, approvals and external effects. Hermes owns internal run progress/history only.
2. The proposal-only token `HERMES_PROPOSAL_KEY` cannot sign or dispatch tools, but **is not yet run-scoped**: a compromised trusted plugin with this token could propose allowed demo operations for any registered run. Per-run capability binding is a mandatory production gate.
3. A demonstration Workflow Registry in the Gateway contains *only* `workflow_demo_001`; its human-readable display name and effects declare that NO real n8n workflow is connected. An unknown workflow ID or an unexpected argument is denied. The demo registry is **not a verified n8n Cloud configuration digest**.
4. Browser, shell, file write, credentialed browsing and native MCP write tools must be disabled by real OS/container isolation before any live Hermes Run is permitted. System prompts or tool descriptions are not a boundary. Live run starts are hard-blocked in code even if credentials are configured.
5. Broker signs `AHMED-ACTION-APPROVAL-V1\n` + canonical JSON of the full `ActionEnvelope`. `approvalContext` includes proposal ID, Hermes run/call IDs, registry name, description, declared effects, registry version, **stable per-proposal effectIdempotencyKey**, owner-approval deadline. A `canonicalPayloadHash` is additionally bound into that signed envelope.

## Non-self-referential digest construction

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

- Hermes trusted plugin `POST /v1/hermes/bridge/actions` proposes `{runId,callId,serviceId,operation,destination,arguments}`. Returns **202** with a stable proposal ID, `PENDING_USER_SIGNATURE_ON_IPHONE` and a **two-hour owner deadline**. It does NOT block waiting for Face ID.
- Plugin `GET /v1/hermes/bridge/actions/:proposalId` polls for `PENDING_USER_SIGNATURE_ON_IPHONE`, `REJECTED`, `EXPIRED`, `OUTCOME_UNKNOWN` or `DEMO_VERIFIED_NO_EFFECT`.
- iPhone `GET /v1/hermes/approvals` shows Gateway-resolved plain-language semantics. It does NOT receive a stale signable envelope.
- iPhone `POST /v1/hermes/approvals/:proposalId/preview` generates or reuses a **90-second** signed envelope. Opening after 30 or 60 minutes still works if the proposal deadline remains valid. If that envelope expires, opening another preview generates a fresh action ID, nonce and expiry; the old signature cannot approve the new preview.
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

The Hermes bridge tests simulate a 30-minute wait, a 60-minute wait, signature snapshot expiry and renewal, tampering with run/call/arguments/expiry, unknown workflow IDs, replay, rejection, an uncertain Broker state, and device-session renewal (session bearer is only 5 minutes). They use a software P-256 key, not hardware Face ID.

## Remaining production blockers

- Real Hermes trusted plugin, attestation of read-only container tools/network mounts and **per-run plugin capability**; currently demo only.
- n8n Cloud workflow integrity verification, scoped credentials, isolated Broker process, authenticated callbacks and **effect reconciliation**.
- Client async event stream/APNs and durable continuation dispatcher with confirmed Hermes session ownership.
- Crash-recovery and two-device/cross-run race tests across separate processes, secure administrative re-enrollment, storage encryption, backup/restore, bounded resource use and a real iPhone device test.
- Pre-existing Core action state machine must be reconciled with Hermes proposal projection before claiming a single authoritative mission ledger.

Official references:
- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://docs.n8n.io/workflows/executions/all-executions/
- https://docs.n8n.io/hosting/securing/security-audit/
