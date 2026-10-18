import assert from 'node:assert/strict';
import { afterEach, test, mock } from 'node:test';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { publicHttpGet, isPublicAddress, HTTP_GET_LIMITS } from '../../src/services/publicHttpGet.ts';

afterEach(() => { mock.restoreAll(); mock.timers.reset(); syncBuiltinESMExports(); });

function harness(responses = [{ body: 'public page' }], addresses = [{ address: '93.184.216.34', family: 4 }]) {
  const lookup = mock.method(dns, 'lookup', async () => addresses);
  syncBuiltinESMExports();
  const calls = [];
  const streams = [];
  const request = (options, callback) => {
    calls.push(options);
    const plan = responses[calls.length - 1] ?? responses.at(-1);
    const req = new EventEmitter();
    req.destroy = () => { req.destroyed = true; };
    req.end = () => queueMicrotask(() => {
      if (plan.noHeaders) return;
      const res = new PassThrough();
      streams.push(res);
      res.statusCode = plan.status ?? 200;
      res.headers = plan.headers ?? {};
      callback(res);
      if (plan.error) res.destroy(new Error('connection reset'));
      else if (!plan.stall) {
        for (const chunk of plan.chunks ?? [plan.body ?? '']) {
          if (!res.destroyed) res.write(chunk);
        }
        if (!res.destroyed) res.end();
      }
    });
    options.signal.addEventListener('abort', () => {
      req.destroy();
      for (const res of streams) res.destroy();
      req.emit('error', options.signal.reason);
    }, { once: true });
    return req;
  };
  mock.method(http, 'request', request);
  mock.method(https, 'request', request);
  return { calls, lookup, streams };
}

for (const ip of [
  '0.0.0.0', '10.1.2.3', '100.100.100.200', '127.0.0.1', '169.254.169.254',
  '172.16.0.1', '172.31.255.255', '192.168.1.1', '192.0.0.8', '192.0.2.1',
  '192.88.99.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1',
  '255.255.255.255', '168.63.129.16', '::', '::1', '::ffff:127.0.0.1',
  '::ffff:8.8.8.8', 'fc00::1', 'fe80::1', 'ff02::1', '64:ff9b::a00:1',
  '2001::1', '2001:db8::1', '2002:7f00:1::', '3fff::1', 'not-an-ip',
]) test(`blocks special address ${ip}`, () => assert.equal(isPublicAddress(ip), false));

for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111']) {
  test(`allows public address ${ip}`, () => assert.equal(isPublicAddress(ip), true));
}

for (const url of [
  '', 'bad url', 'file:///etc/passwd', 'ftp://example.com', 'gopher://example.com',
  'http://user:password@example.com', 'http://example.com:8080', 'https://example.com:80',
  'http://localhost', 'http://LOCALHOST.', 'http://foo.local', 'http://service.internal',
  'http://metadata.google.internal', 'http://metadata.goog', 'http://router.home.arpa',
  'http://127.1', 'http://2130706433', 'http://0x7f000001', 'http://0177.0.0.1',
  'http://%31%32%37.0.0.1', 'http://[::1]', 'http://[::ffff:127.0.0.1]',
  'http://169.254.169.254/latest/meta-data/', 'http://168.63.129.16',
]) test(`rejects URL before networking: ${url}`, async () => {
  const h = harness();
  await assert.rejects(publicHttpGet(url));
  assert.equal(h.calls.length, 0);
  assert.equal(h.lookup.mock.callCount(), 0);
});

test('fetches public HTTPS with pinned IP and original TLS/Host identity', async () => {
  const h = harness([{ body: 'أهلاً' }]);
  assert.equal(await publicHttpGet('https://example.com:443/page?q=1#fragment'), 'أهلاً');
  assert.equal(h.lookup.mock.callCount(), 1);
  assert.equal(h.calls[0].hostname, '93.184.216.34');
  assert.equal(h.calls[0].servername, 'example.com');
  assert.equal(h.calls[0].headers.Host, 'example.com');
  assert.equal(h.calls[0].path, '/page?q=1');
  assert.equal(h.calls[0].agent, false);
  assert.equal(h.calls[0].rejectUnauthorized, undefined);
});

test('allows literal public IPv4 and IPv6 without DNS', async () => {
  const h = harness();
  await publicHttpGet('http://8.8.8.8/');
  await publicHttpGet('https://[2606:4700:4700::1111]/');
  assert.equal(h.lookup.mock.callCount(), 0);
  assert.equal(h.calls[1].hostname, '2606:4700:4700::1111');
});

for (const addresses of [[], [{ address: '10.0.0.1', family: 4 }],
  [{ address: '93.184.216.34', family: 4 }, { address: '::1', family: 6 }],
  [{ address: '93.184.216.34', family: 6 }]]) {
  test(`fails closed on DNS answers ${JSON.stringify(addresses)}`, async () => {
    const h = harness(undefined, addresses);
    await assert.rejects(publicHttpGet('https://example.com'), /public IP/);
    assert.equal(h.calls.length, 0);
  });
}

test('DNS failure cannot open a connection', async () => {
  const h = harness();
  h.lookup.mock.mockImplementation(async () => { throw new Error('ENOTFOUND'); });
  await assert.rejects(publicHttpGet('https://example.com'), /ENOTFOUND/);
  assert.equal(h.calls.length, 0);
});

test('revalidates DNS on same-host redirects and blocks rebinding', async () => {
  const h = harness([{ status: 302, headers: { location: '/next' } }]);
  h.lookup.mock.mockImplementationOnce(async () => [{ address: '127.0.0.1', family: 4 }], 1);
  await assert.rejects(publicHttpGet('https://example.com'), /public IP/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.streams[0].destroyed, true);
});

for (const location of ['http://127.0.0.1', '//169.254.169.254/metadata',
  'http://internal.example.com', 'file:///etc/passwd', 'https://user:pass@example.com',
  'https://example.com:9000']) {
  test(`blocks unsafe redirect ${location}`, async () => {
    const h = harness([{ status: 302, headers: { location } }]);
    h.lookup.mock.mockImplementationOnce(async () => [{ address: '10.1.1.1', family: 4 }], 1);
    await assert.rejects(publicHttpGet('http://example.com'));
    assert.equal(h.calls.length, 1);
  });
}

test('allows relative and cross-origin public redirects without forwarding credentials', async () => {
  const h = harness([
    { status: 301, headers: { location: '/next', 'set-cookie': 'secret=1' } },
    { status: 307, headers: { location: 'https://other.example.com/final' } },
    { body: 'done' },
  ]);
  assert.equal(await publicHttpGet('https://example.com/start'), 'done');
  assert.equal(h.lookup.mock.callCount(), 3);
  assert.equal(h.calls[1].path, '/next');
  assert.deepEqual(h.calls[2].headers, { Host: 'other.example.com', 'Accept-Encoding': 'identity' });
});

test('blocks HTTPS downgrade', async () => {
  const h = harness([{ status: 302, headers: { location: 'http://example.com' } }]);
  await assert.rejects(publicHttpGet('https://example.com'), /downgrade/);
  assert.equal(h.calls.length, 1);
});

test('limits redirect loops', async () => {
  const h = harness([{ status: 308, headers: { location: '/loop' } }]);
  await assert.rejects(publicHttpGet('https://example.com'), /Too many/);
  assert.equal(h.calls.length, HTTP_GET_LIMITS.maxRedirects + 1);
});

test('accepts exactly the byte limit', async () => {
  harness([{ body: Buffer.alloc(HTTP_GET_LIMITS.maxBytes, 'a') }]);
  assert.equal((await publicHttpGet('https://example.com')).length, HTTP_GET_LIMITS.maxBytes);
});

for (const response of [
  { headers: { 'content-length': String(HTTP_GET_LIMITS.maxBytes + 1) } },
  { chunks: [Buffer.alloc(HTTP_GET_LIMITS.maxBytes), Buffer.from('x')] },
  { headers: { 'content-length': '1' }, body: Buffer.alloc(HTTP_GET_LIMITS.maxBytes + 1) },
  { headers: { 'content-encoding': 'gzip' }, body: 'compressed' },
]) test('rejects oversized or encoded response and destroys stream', async () => {
  const h = harness([response]);
  await assert.rejects(publicHttpGet('https://example.com'), /size limit|Compressed/);
  assert.equal(h.streams[0].destroyed, true);
});

test('rejects interrupted response', async () => {
  harness([{ error: true }]);
  await assert.rejects(publicHttpGet('https://example.com'), /connection reset/);
});

for (const phase of ['dns', 'headers', 'body']) test(`deadline includes ${phase}`, async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness([{ noHeaders: phase === 'headers', stall: phase === 'body' }]);
  if (phase === 'dns') h.lookup.mock.mockImplementation(() => new Promise(() => {}));
  const pending = publicHttpGet('https://example.com');
  const rejection = assert.rejects(pending, /timed out/);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  mock.timers.tick(HTTP_GET_LIMITS.timeoutMs + 1);
  await rejection;
  if (phase === 'dns') assert.equal(h.calls.length, 0);
  else assert.equal(h.calls[0].signal.aborted, true);
});

test('late DNS completion after timeout never opens a socket', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  let finishDns;
  h.lookup.mock.mockImplementation(() => new Promise((resolve) => { finishDns = resolve; }));
  const pending = assert.rejects(publicHttpGet('https://example.com'), /timed out/);
  mock.timers.tick(HTTP_GET_LIMITS.timeoutMs + 1);
  await pending;
  finishDns([{ address: '93.184.216.34', family: 4 }]);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(h.calls.length, 0);
});

test('redirect hops share one deadline rather than resetting it', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness([{ status: 302, headers: { location: '/next' } }, { stall: true }]);
  h.lookup.mock.mockImplementation(async () => {
    mock.timers.tick(6000);
    return [{ address: '93.184.216.34', family: 4 }];
  });
  await assert.rejects(publicHttpGet('https://example.com'), /timed out/);
  assert.equal(h.calls.length, 1);
});
