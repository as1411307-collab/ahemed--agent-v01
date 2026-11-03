import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditCredentialBoundaries } from '../apps/core/src/security/credential-audit.js';

export function main(argv: string[], env: Record<string, string | undefined> = process.env): number {
  const index = argv.indexOf('--root');
  const repoRoot = index >= 0 && argv[index + 1] ? argv[index + 1] : process.cwd();
  const strict = argv.includes('--strict');
  const result = auditCredentialBoundaries(repoRoot, env);
  // "strict" does not pretend that exported workflows inventory remote n8n credentials.
  const passed = result.passedLocalChecks && (!strict || result.remoteN8nVerified);
  process.stdout.write(JSON.stringify({ ...result, passed }, null, 2) + '\n');
  return passed ? 0 : 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}