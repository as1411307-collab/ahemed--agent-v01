import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createNexus } from '../../core/src/nexus/server.ts';

const studioRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = path.resolve(studioRoot, '../..');

test('actual Gateway + browser: authentication, desired config revisions, blocked mission and read-only replay', { timeout: 90_000 }, async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'nexus-studio-browser-'));
  const appToken = `browser-test-${randomUUID()}`;
  const nexus = await createNexus({ dbFile: path.join(sandbox, 'gateway.db'), workspaceRoot: path.join(sandbox, 'workspace'), appToken });
  let vite, browser;
  try {
    const gatewayUrl = await nexus.app.listen({ host: '127.0.0.1', port: 0 });
    vite = await createServer({
      root: studioRoot,
      configFile: path.join(studioRoot, 'vite.config.ts'),
      server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/nexus': { target: gatewayUrl, changeOrigin: false } } },
      logLevel: 'error',
    });
    await vite.listen();
    const address = vite.httpServer.address();
    assert.ok(address && typeof address !== 'string');
    const systemChromium = ['/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
    browser = await chromium.launch({ executablePath: process.env.BROWSER_BIN || systemChromium, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1512, height: 1100 }, reducedMotion: 'reduce' });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole('heading', { name: 'Mission Theater', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '■ EMERGENCY STOP', exact: true }).isDisabled(), true);
    assert.equal(await page.locator('canvas, video').count(), 0, 'No mock world or canned video substitutes for Unreal');

    // Authentication failure is visible and does not unlock data.
    await page.getByLabel('Gateway access token').fill('wrong-token');
    await page.getByRole('button', { name: 'Connect Gateway' }).click();
    await page.getByRole('alert').filter({ hasText: '401' }).waitFor();
    assert.equal(await page.getByText('No missions loaded', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await page.getByLabel('Gateway access token').fill(appToken);
    await page.getByRole('button', { name: 'Connect Gateway' }).click();
    await page.getByText('Revision 1', { exact: true }).waitFor();
    const browserStorage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, query: location.search }));
    assert.equal(JSON.stringify(browserStorage).includes(appToken), false, 'Gateway token is not persisted or placed in a URL');
    await page.getByText('Execution: blocked', { exact: true }).waitFor();

    // Desired edits stay local until validation and optimistic Apply.
    await page.getByRole('button', { name: 'Architect Studio', exact: false }).click();
    const editor = page.getByLabel('Desired configuration · JSON');
    await editor.waitFor();
    const original = JSON.parse(await editor.inputValue());
    const preview = structuredClone(original);
    preview.world.preset = 'Analytical';
    await editor.fill(JSON.stringify(preview, null, 2));
    assert.equal(nexus.state.getConfig().revision, 1);
    assert.equal(nexus.state.getConfig().config.world.preset, original.world.preset);
    assert.equal(await page.getByRole('button', { name: 'Apply revision', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Validate', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Gateway validation passed' }).waitFor();
    await page.getByRole('button', { name: 'Apply revision', exact: true }).click();
    await page.getByText('Revision 2', { exact: true }).first().waitFor();
    assert.equal(nexus.state.getConfig().revision, 2);
    assert.equal(nexus.state.getConfig().config.world.preset, 'Analytical');

    // Undo/redo affects the draft; Restore appends a new revision.
    await page.getByLabel('Visual preset').selectOption('Explorative');
    await page.getByRole('button', { name: '↶ Undo', exact: true }).click();
    assert.equal(JSON.parse(await editor.inputValue()).world.preset, 'Analytical');
    await page.getByRole('button', { name: '↷ Redo', exact: true }).click();
    assert.equal(JSON.parse(await editor.inputValue()).world.preset, 'Explorative');
    assert.equal(nexus.state.getConfig().revision, 2);
    await page.locator('.version-row').filter({ hasText: 'Revision 1' }).getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByText('Revision 3', { exact: true }).first().waitFor();
    assert.equal(nexus.state.getConfig().config.world.preset, original.world.preset);

    // An external save causes 409; it must not be overwritten by this stale tab.
    const newer = structuredClone(nexus.state.getConfig().config);
    newer.world.preset = 'Executive';
    nexus.state.applyConfig(newer, 3);
    await page.getByLabel('Visual preset').selectOption('Explorative');
    await page.getByRole('button', { name: 'Validate', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Gateway validation passed' }).waitFor();
    await page.getByRole('button', { name: 'Apply revision', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Conflict:' }).waitFor();
    assert.equal(nexus.state.getConfig().revision, 4);
    assert.equal(nexus.state.getConfig().config.world.preset, 'Executive');
    await page.getByRole('button', { name: 'Reload applied', exact: true }).click();
    await page.getByText('Revision 4', { exact: true }).first().waitFor();

    // Native engine absent: persist a blocked mission, never fabricate a run/tool.
    await page.getByRole('button', { name: 'Mission Theater', exact: false }).click();
    const goal = 'Browser acceptance: verify unavailable engine without side effects';
    await page.getByLabel('What should the principal agent accomplish?').fill(goal);
    await page.getByRole('button', { name: 'Submit mission' }).click();
    await page.getByRole('alert').filter({ hasText: 'Hermes is not configured' }).waitFor();
    await page.getByRole('button', { name: goal, exact: false }).waitFor({ timeout: 12000 });
    await page.getByRole('button', { name: goal, exact: false }).click();
    const mission = nexus.state.listMissions()[0];
    assert.equal(mission.status, 'blocked');
    assert.equal(mission.runId, null);
    assert.equal(nexus.state.events(mission.id).some(event => event.type === 'tool.called'), false);
    assert.equal(await page.getByRole('button', { name: '■ Request stop', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Mission Replay', exact: false }).click();
    await page.getByLabel('Event position', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: '■ Request stop', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Send steer', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Approve once', exact: true }).count(), 0);

    await page.getByRole('button', { name: 'Integration Hub', exact: false }).click();
    await page.getByRole('heading', { name: 'Integration registry' }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'Test connection', exact: false }).count() > 0);
    assert.equal(nexus.integrations.list().some(integration => integration.status === 'connected'), false);

    // Capture the real, connected control interface; never a claimed Unreal render.
    await page.getByRole('button', { name: 'Architect Studio', exact: false }).click();
    await editor.waitFor();
    await mkdir(path.join(repoRoot, 'docs/evidence'), { recursive: true });
    await page.screenshot({ path: path.join(repoRoot, 'docs/evidence/architect-studio.png'), fullPage: true, animations: 'disabled' });
    assert.deepEqual(pageErrors, []);
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await page.getByLabel('Gateway access token').waitFor();
    assert.equal(await page.getByLabel('Gateway access token').inputValue(), '');
  } finally {
    await browser?.close();
    await vite?.close();
    await nexus.close();
    await rm(sandbox, { recursive: true, force: true });
  }
});
