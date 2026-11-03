import { existsSync } from "node:fs";
import path from "node:path";
import { AnthropicModelClient } from "./model.js";
import { createCore } from "./server.js";
import type {HermesBridgeOptions} from "./hermes-bridge.js";
import { assessCapabilityTier, auditCredentialBoundaries } from "./security/credential-audit.js";

// Secrets come from the environment only. A local .env (git-ignored) is loaded if present.
const envFile = path.resolve(".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Fail closed for production external actions. n8n being unverified does NOT
// automatically block strictly read-only model-backed conversations.
// This permits a bounded entrypoint, not a production security certification.
if (process.env.NODE_ENV === "production") {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  const security = auditCredentialBoundaries(repoRoot, process.env);
  const requestedTier = process.env.CORE_PRODUCTION_TIER === "COGNITIVE_READ_ONLY"
    ? "COGNITIVE_READ_ONLY" : "EXTERNAL_ACTUATION";
  const decision = assessCapabilityTier(security, requestedTier);
  const host = (process.env.HOST ?? "127.0.0.1").trim();
  // An operator-managed private HTTPS reverse proxy is required for phone access.
  const localOnly = host === "127.0.0.1" || host === "::1" || host === "localhost";
  // The Hermes bridge still has a shared proposal key, not a proven worker
  // identity. Its presence must block this restricted production entrypoint.
  const noHermesBridge = ![
    process.env.HERMES_API_URL, process.env.HERMES_API_SERVER_KEY,
    process.env.HERMES_PROPOSAL_KEY,
  ].some(value => !!value?.trim());
  if (!decision.allowedToStart || !localOnly || !noHermesBridge) {
    console.error("SECURITY_GATE_BLOCKED: restricted production start denied.");
    console.error(JSON.stringify({
      tier: requestedTier, reason: decision.reason,
      localOnly, noHermesBridge,
      findings: security.findings, limitations: security.limitations,
    }));
    process.exit(78);
  }
  console.warn("COGNITIVE_READ_ONLY: model requests may leave this host; external effects are blocked.");
  console.warn("NOT ATTESTED: no live provider, HTTPS proxy, iPhone, or privacy test has been performed.");
}


function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required environment variable ${name}. See apps/core/.env.example.`);
    process.exit(1);
  }
  return v;
}

const ownerId = required("CORE_OWNER_ID");
const pairingCode = process.env.CORE_PAIRING_CODE?.trim() || null;
const apiKey = required("ANTHROPIC_API_KEY");
const modelName = required("MODEL_NAME");
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1"; // Serve iPhone through a TLS reverse proxy.
const workspaceRoot = path.resolve(process.env.WORKSPACE_ROOT ?? "./workspace");
const dbFile = path.resolve(process.env.DB_FILE ?? "./ahmed-core.db");

const hermesSettings = [process.env.HERMES_API_URL,process.env.HERMES_API_SERVER_KEY,process.env.HERMES_PROPOSAL_KEY];
const setCount = hermesSettings.filter(v => !!v?.trim()).length;
if(setCount !== 0 && setCount !== 3) throw new Error("HERMES_BRIDGE_CONFIG_INCOMPLETE");
const hermesBridge: HermesBridgeOptions | undefined = setCount === 3 ? {
  baseUrl: hermesSettings[0]!, apiKey: hermesSettings[1]!, proposalKey: hermesSettings[2]!,
} : undefined;

const core = await createCore({
  dbFile,
  workspaceRoot,
  deviceSecurity: {ownerId,pairingCode},
  hermesBridge,
  model: new AnthropicModelClient(apiKey, modelName),
  strictCognitiveOnly: process.env.NODE_ENV === "production",
  logger: true,
});

await core.app.listen({ port, host });
console.log(`AHMED Core listening on http://${host}:${port}`);
console.log(`Workspace: ${core.workspace.root}`);
console.log(`Database:  ${dbFile}`);
console.log(`Model:     ${modelName}`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void core.close().finally(() => process.exit(0));
  });
}
