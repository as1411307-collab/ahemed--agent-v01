# Security gates — phase 1 (draft, fail-closed roadmap)

This is **not** a claim that Ahmed Agent is production-hardened. This branch
contains an offline credential inventory. Existing main still has
EXPO_PUBLIC_APP_TOKEN, the APP_TOKEN shared bearer, and unsandboxed Agent Core
file access. Do not put this system directly on the public Internet.

## What the prestart audit can prove

- It checks concrete assignments in local .env files, active process environment
  variables, references to EXPO_PUBLIC_APP_TOKEN in mobile source, and **exported**
  n8n workflow credentials. It never logs secret values.
- It distinguishes inference provider API keys (WARN; may belong to a dedicated
  inference proxy) from action-capable service credentials (BLOCK outside broker).
- It fails closed on malformed exported n8n workflows.

Run at repo root with the @ahmed/core tsx binary (after npm ci):

    npm exec -w @ahmed/core -- tsx scripts/audit-credential-monopoly.ts --root .

Use --strict as a **production stop**: strict mode intentionally fails until
remote n8n credential discovery, Docker and service-account identities are
verified. A green local scan alone is never deployment certification.

## Remaining enforcement gaps

1. Replace the Expo public static bearer and legacy Fastify APPROVE route with
   owner/device-scoped authentication and a signed, stored action envelope.
2. Put the Action Broker in a **separate OS principal/process** with broker-only
   action credentials. The Agent and coding worker must not have the destination
   credentials or a direct socket path to privileged services.
3. Externally audit n8n Cloud: actual workflows, credentials, cron/webhook
   triggers and OAuth scopes. Exported JSON credentials references are not
   equivalent to inspecting the encrypted remote credential store.
4. Run real iOS Secure Enclave signing and enrollment/revocation tests. A valid
   P-256 signature alone cannot remotely attest Secure Enclave origin; app/device
   attestation and enrollment need their own design.
5. Use RFC8785 strict I-JSON canonical bytes; reject duplicate keys during
   inbound parsing, unsupported numeric forms, lone surrogates, and unexpected
   fields. Display every actionable parameter *before* requesting presence.
6. For MCP 2026-07-28 use official TypeScript SDK v2 for modern/legacy
   negotiation. The client must implement Mcp-Method, Mcp-Name and request _meta;
   do not treat server-provided readOnlyHint or description as authority.
7. Crash after an external side effect but before durable receipt remains
   ambiguous. Mark UNKNOWN and reconcile upstream by idempotency key; never
   indiscriminately retry.

## Reference research

- https://datatracker.ietf.org/doc/html/rfc8785
- https://blog.modelcontextprotocol.io/posts/2026-07-28/
- https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions
- https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave
- https://docs.expo.dev/modules/get-started

Branch is a **draft phase-1 PR**; no production server was changed, no iPhone
hardware signing was tested, and remote n8n access was not inspected.