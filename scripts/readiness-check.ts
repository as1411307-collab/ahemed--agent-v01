import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { auditCredentialBoundaries } from "../apps/core/src/security/credential-audit.js";

type Mode = "dev" | "prod";
type Level = "ERROR" | "WARN";

interface Check {
  id: string;
  level: Level;
  ok: boolean;
  message: string;
  hint?: string;
}

function parseMode(argv: string[]): Mode {
  const modeArg = argv.find((a) => a.startsWith("--mode="));
  if (!modeArg) return "dev";
  const value = modeArg.slice("--mode=".length);
  if (value === "dev" || value === "prod") return value;
  throw new Error(`Unsupported mode "${value}". Use --mode=dev or --mode=prod.`);
}

function parseDotEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  const text = fs.readFileSync(file, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const match = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const inlineComment = value.indexOf(" #");
      if (inlineComment >= 0) value = value.slice(0, inlineComment).trim();
    }
    out[key] = value;
  }
  return out;
}

function readEnvFile(file: string): { exists: boolean; values: Record<string, string> } {
  if (!fs.existsSync(file)) return { exists: false, values: {} };
  return { exists: true, values: parseDotEnv(file) };
}

function pick(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function add(
  checks: Check[],
  id: string,
  level: Level,
  ok: boolean,
  message: string,
  hint?: string,
): void {
  checks.push({ id, level, ok, message, hint });
}

function canWriteOrCreate(targetDir: string): boolean {
  let probe = targetDir;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) return false;
    probe = parent;
  }
  try {
    if (!fs.statSync(probe).isDirectory()) return false;
    fs.accessSync(probe, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function format(check: Check): string {
  if (check.ok) return `[OK] ${check.id}: ${check.message}`;
  const tag = check.level === "ERROR" ? "FAIL" : "WARN";
  const hint = check.hint ? ` | hint: ${check.hint}` : "";
  return `[${tag}] ${check.id}: ${check.message}${hint}`;
}

function summarize(mode: Mode, checks: Check[]): number {
  const errors = checks.filter((c) => !c.ok && c.level === "ERROR");
  const warnings = checks.filter((c) => !c.ok && c.level === "WARN");
  console.log(`Readiness mode: ${mode}`);
  for (const check of checks) console.log(format(check));
  console.log(
    `Summary: ${errors.length} error(s), ${warnings.length} warning(s), ${checks.length} check(s).`,
  );
  if (errors.length > 0) {
    console.log("Result: NOT_READY");
    return 2;
  }
  console.log("Result: READY");
  return 0;
}

function main(argv: string[]): number {
  const mode = parseMode(argv);
  const repoRoot = process.cwd();
  const checks: Check[] = [];
  const coreEnvPath = path.join(repoRoot, "apps/core/.env");
  const coreEnv = readEnvFile(coreEnvPath);

  add(
    checks,
    "core.env",
    "ERROR",
    coreEnv.exists,
    coreEnv.exists ? "apps/core/.env found." : "apps/core/.env is missing.",
    "copy apps/core/.env.example to apps/core/.env",
  );
  const coreOwnerId = pick(process.env.CORE_OWNER_ID, coreEnv.values.CORE_OWNER_ID);
  add(
    checks,
    "CORE_OWNER_ID",
    "ERROR",
    !!coreOwnerId,
    coreOwnerId ? "present." : "missing.",
    "set CORE_OWNER_ID in apps/core/.env",
  );
  if (coreOwnerId) {
    add(
      checks,
      "CORE_OWNER_ID format",
      "ERROR",
      /^[a-zA-Z0-9_-]{8,100}$/.test(coreOwnerId),
      "must be 8-100 chars [a-zA-Z0-9_-].",
    );
  }

  const pairingCode = pick(process.env.CORE_PAIRING_CODE, coreEnv.values.CORE_PAIRING_CODE);
  add(
    checks,
    "CORE_PAIRING_CODE",
    "WARN",
    !!pairingCode && pairingCode.length >= 24,
    pairingCode
      ? "present and length is acceptable."
      : "missing (required for secure device enrollment).",
    "use a 24+ character high-entropy one-time code",
  );

  const anthropicApiKey = pick(process.env.ANTHROPIC_API_KEY, coreEnv.values.ANTHROPIC_API_KEY);
  add(
    checks,
    "ANTHROPIC_API_KEY",
    "ERROR",
    !!anthropicApiKey,
    anthropicApiKey ? "present." : "missing.",
    "set ANTHROPIC_API_KEY in apps/core/.env",
  );

  const modelName = pick(process.env.MODEL_NAME, coreEnv.values.MODEL_NAME);
  add(
    checks,
    "MODEL_NAME",
    "ERROR",
    !!modelName,
    modelName ? "present." : "missing.",
    "set MODEL_NAME in apps/core/.env",
  );

  const host = pick(process.env.HOST, coreEnv.values.HOST) ?? "127.0.0.1";
  add(
    checks,
    "HOST binding",
    "WARN",
    host === "127.0.0.1",
    host === "127.0.0.1"
      ? "loopback binding is safe for local core."
      : `host is ${host}.`,
    "prefer 127.0.0.1 and expose only through trusted HTTPS reverse proxy",
  );

  const workspaceRoot = path.resolve(
    repoRoot,
    pick(process.env.WORKSPACE_ROOT, coreEnv.values.WORKSPACE_ROOT) ?? "./workspace",
  );
  add(
    checks,
    "WORKSPACE_ROOT",
    "ERROR",
    canWriteOrCreate(workspaceRoot),
    `path is ${workspaceRoot}`,
    "ensure parent directory is writable",
  );

  const dbFile = path.resolve(repoRoot, pick(process.env.DB_FILE, coreEnv.values.DB_FILE) ?? "./ahmed-core.db");
  add(
    checks,
    "DB_FILE",
    "ERROR",
    canWriteOrCreate(path.dirname(dbFile)),
    `path is ${dbFile}`,
    "ensure database directory is writable",
  );

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  add(
    checks,
    "node-version",
    "WARN",
    Number.isFinite(nodeMajor) && nodeMajor >= 22,
    `detected Node.js ${process.versions.node}.`,
    "use Node 22+ to match CI/toolchain",
  );

  const envForStaticAudit: Record<string, string | undefined> = {
    CORE_OWNER_ID: coreOwnerId,
    CORE_PAIRING_CODE: pairingCode,
    ANTHROPIC_API_KEY: anthropicApiKey,
    MODEL_NAME: modelName,
    HOST: host,
    WORKSPACE_ROOT: workspaceRoot,
    DB_FILE: dbFile,
  };
  const staticAudit = auditCredentialBoundaries(repoRoot, envForStaticAudit);
  if (staticAudit.passedLocalChecks) {
    add(checks, "credential-boundary", "ERROR", true, "local boundary checks passed.");
  } else {
    const codes = [...new Set(staticAudit.findings.filter((f) => f.severity === "BLOCK").map((f) => f.code))];
    add(
      checks,
      "credential-boundary",
      "ERROR",
      false,
      `blocking findings detected (${codes.join(", ") || "unknown"}).`,
      "remove action credentials from env/mobile sources and rerun audit",
    );
  }

  if (mode === "prod") {
    add(
      checks,
      "remote-n8n-proof",
      "ERROR",
      staticAudit.remoteN8nVerified,
      "remote n8n verification must be true.",
      "implement and verify remote n8n credential/scope checks",
    );
    const serverSource = fs.readFileSync(path.join(repoRoot, "apps/core/src/server.ts"), "utf8");
    const hasDemoNoOp = ["DEMO_NO_EXECUTION", "DEMO_ONLY_NO_EFFECT", "DEMO_SIGNED_NO_EXECUTION"].some((token) =>
      serverSource.includes(token),
    );
    add(
      checks,
      "signed-approval-execution",
      "ERROR",
      !hasDemoNoOp,
      hasDemoNoOp
        ? "signed approval path still contains demo/no-effect markers."
        : "no demo/no-effect marker detected in signed approval path.",
      "replace demo dispatcher with real brokered execution before production",
    );
  } else {
    add(
      checks,
      "production-note",
      "WARN",
      false,
      "prod readiness is expected to fail until remote n8n proof and demo no-op path are replaced.",
      "run npm run readiness:prod after production hardening",
    );
  }

  return summarize(mode, checks);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`readiness-check failed: ${reason}\n`);
  process.exitCode = 2;
}
