import fs from 'node:fs';
import path from 'node:path';

/**
 * Narrow pre-start *inventory*, not a complete secret scanner or a proof of
 * remote n8n permissions. Report variable names, never secret values.
 */
export interface Finding {
  severity: 'BLOCK' | 'WARN';
  code: 'ACTION_CREDENTIAL' | 'PUBLIC_CLIENT_TOKEN' | 'N8N_CREDENTIAL_REFERENCE' | 'INVALID_N8N_EXPORT' | 'MODEL_KEY_SCOPE_UNVERIFIED';
  where: string;
  key?: string;
}
export interface CredentialAudit {
  passedLocalChecks: boolean;
  remoteN8nVerified: false;
  envFilesInspected: number;
  n8nExportsInspected: number;
  findings: Finding[];
  limitations: string[];
}

const ACTION_KEYS = /^(?:GITHUB_TOKEN|GITHUB_PAT|GH_TOKEN|STRIPE_SECRET(?:_KEY)?|N8N_WEBHOOK_SECRET|N8N_API_KEY|MCP_[A-Z0-9_]*(?:TOKEN|SECRET)|EXTERNAL_[A-Z0-9_]*(?:KEY|TOKEN|SECRET))$/i;
const MODEL_KEYS = /^(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|OLLAMA_API_KEY)$/i;
const PUBLIC_KEYS = /^EXPO_PUBLIC_[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)$/i;
const EXAMPLE = /^\.env\.(?:example|sample|template|dist)$/i;
const EMPTY = /^(?:\s*|["']?\s*(?:change-me.*|replace[-_ ].*|your[-_ ].*|<[^>]+>|\$\{[^}]+\})\s*["']?)$/i;

function safeFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const dirs = [root];
  while (dirs.length) {
    const dir = dirs.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.expo'].includes(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) dirs.push(full);
      else if (entry.isFile()) files.push(full);
      if (files.length > 3000) throw new Error('CREDENTIAL_AUDIT_TOO_MANY_FILES');
    }
  }
  return files;
}

function checkName(key: string, where: string): Finding[] {
  if (key === 'APP_TOKEN' || PUBLIC_KEYS.test(key)) return [{severity: 'BLOCK', code: 'PUBLIC_CLIENT_TOKEN', where, key}];
  if (ACTION_KEYS.test(key)) return [{severity: 'BLOCK', code: 'ACTION_CREDENTIAL', where, key}];
  if (MODEL_KEYS.test(key)) return [{severity: 'WARN', code: 'MODEL_KEY_SCOPE_UNVERIFIED', where, key}];
  return [];
}

export function auditCredentialBoundaries(
  repoRoot: string,
  runtimeEnv: Record<string, string | undefined> = {},
): CredentialAudit {
  const findings: Finding[] = [];
  let envFilesInspected = 0;
  let n8nExportsInspected = 0;
  const root = path.resolve(repoRoot);
  for (const sub of ['apps/core', 'apps/mobile', 'apps/workers', 'n8n/workflows']) {
    for (const file of safeFiles(path.join(root, sub))) {
      const where = path.relative(root, file);
      const name = path.basename(file);
      if ((name === '.env' || name.startsWith('.env.')) && !EXAMPLE.test(name)) {
        envFilesInspected++;
        for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
          const match = line.trim().replace(/^export\s+/, '').match(/^([a-zA-Z_][a-zA-Z_0-9]*)\s*=(.*)$/);
          if (match && !EMPTY.test(match[2].trim())) findings.push(...checkName(match[1], where));
        }
      }
      if (sub === 'apps/mobile' && /\.[cm]?[jt]sx?$/.test(name)) {
        // This reference itself is unsafe: Expo publishes EXPO_PUBLIC values.
        if (/\bEXPO_PUBLIC_APP_TOKEN\b/.test(fs.readFileSync(file, 'utf8'))) {
          findings.push({severity: 'BLOCK', code: 'PUBLIC_CLIENT_TOKEN', where, key: 'EXPO_PUBLIC_APP_TOKEN'});
        }
      }
      if (sub === 'n8n/workflows' && name.endsWith('.json')) {
        n8nExportsInspected++;
        try {
          const workflow = JSON.parse(fs.readFileSync(file, 'utf8')) as {nodes?: unknown};
          if (!Array.isArray(workflow.nodes)) throw new Error('Invalid workflow shape');
          for (const node of workflow.nodes as Record<string, unknown>[]) {
            if (!node || typeof node !== 'object') throw new Error('Invalid node');
            const creds = node.credentials;
            if (creds && typeof creds === 'object' && Object.keys(creds).length > 0) {
              findings.push({severity: 'BLOCK', code: 'N8N_CREDENTIAL_REFERENCE', where});
            }
          }
        } catch {
          findings.push({severity: 'BLOCK', code: 'INVALID_N8N_EXPORT', where});
        }
      }
    }
  }
  for (const [key, value] of Object.entries(runtimeEnv)) {
    if (typeof value === 'string' && value && !EMPTY.test(value)) findings.push(...checkName(key, 'core runtime environment'));
  }
  return {
    passedLocalChecks: !findings.some(f => f.severity === 'BLOCK'),
    remoteN8nVerified: false,
    envFilesInspected, n8nExportsInspected, findings,
    limitations: [
      'The encrypted n8n Cloud credential store and active remote workflows were not audited.',
      'Systemd/Docker/OS key stores and runtime network paths remain unverified.',
      'An environment variable name cannot establish OAuth scopes or credential reach.',
      'Local checks passing do not certify the deployment; external inventory and network isolation tests are required.',
    ],
  };
}
