import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditCredentialBoundaries } from '../src/security/credential-audit.js';

function fixture(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'ahmed-cred-audit-'));
  try {
    mkdirSync(join(root, 'apps/core'), {recursive:true});
    mkdirSync(join(root, 'apps/mobile/src'), {recursive:true});
    mkdirSync(join(root, 'n8n/workflows'), {recursive:true});
    fn(root);
  } finally { rmSync(root, {recursive:true, force:true}); }
}
describe('credential boundary audit (offline coverage only)', () => {
  it('does not treat a reference to a model key as a leaked value', () => fixture(root => {
    writeFileSync(join(root, 'apps/core/x.ts'), "const name = 'OPENAI_API_KEY';");
    const r = auditCredentialBoundaries(root);
    expect(r.passedLocalChecks).toBe(true);
    expect(r.remoteN8nVerified).toBe(false);
  }));
  it('blocks real privileged dotenv tokens without logging their values', () => fixture(root => {
    const secret = 'do-not-echo-this-value-123';
    writeFileSync(join(root, 'apps/core/.env'), 'GITHUB_TOKEN=' + secret + '\nANTHROPIC_API_KEY=inference-token\n');
    const r = auditCredentialBoundaries(root);
    expect(r.passedLocalChecks).toBe(false);
    expect(r.findings.map(f => f.code)).toContain('ACTION_CREDENTIAL');
    expect(r.findings.map(f => f.code)).toContain('MODEL_KEY_SCOPE_UNVERIFIED');
    expect(JSON.stringify(r)).not.toContain(secret);
  }));
  it('blocks EXPO_PUBLIC_APP_TOKEN in mobile source', () => fixture(root => {
    writeFileSync(join(root, 'apps/mobile/src/api.ts'), 'const token=process.env.EXPO_PUBLIC_APP_TOKEN;');
    const r = auditCredentialBoundaries(root);
    expect(r.passedLocalChecks).toBe(false);
    expect(r.findings.map(f => f.code)).toContain('PUBLIC_CLIENT_TOKEN');
  }));
  it('rejects exported n8n workflows with direct credentials', () => fixture(root => {
    writeFileSync(join(root, 'n8n/workflows/a.json'), JSON.stringify({
      nodes: [{name:'Send',credentials:{gmailOAuth2:{id:'1'}}}],
    }));
    const r = auditCredentialBoundaries(root);
    expect(r.passedLocalChecks).toBe(false);
    expect(r.findings.map(f => f.code)).toContain('N8N_CREDENTIAL_REFERENCE');
  }));
  it('does not assume invalid workflow JSON is safe', () => fixture(root => {
    writeFileSync(join(root, 'n8n/workflows/b.json'), '{not-json');
    const r = auditCredentialBoundaries(root);
    expect(r.findings.map(f => f.code)).toContain('INVALID_N8N_EXPORT');
  }));
  it('blocks runtime action credentials regardless of files', () => fixture(root => {
    const r = auditCredentialBoundaries(root, {N8N_WEBHOOK_SECRET:'value'});
    expect(r.passedLocalChecks).toBe(false);
    expect(r.findings.map(f => f.code)).toContain('ACTION_CREDENTIAL');
  }));
});