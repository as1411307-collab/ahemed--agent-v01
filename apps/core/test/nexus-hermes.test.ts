import { describe, expect, it, vi } from 'vitest';
import { HermesClient, parseSse } from '../src/nexus/hermes.js';

describe('Hermes public Runs adapter (contract fixtures, not live Hermes)', () => {
  it('refuses browser-like arbitrary remote or credential-bearing endpoints', () => {
    for (const url of ['http://169.254.169.254', 'https://evil.test', 'http://u:p@localhost:8642', 'http://localhost:8642/path']) {
      expect(() => new HermesClient({ url, key: 'private' })).toThrow();
    }
  });
  it('maps exact approval request to once/deny without session-wide grants', async () => {
    const fetcher = vi.fn(async () => Response.json({ resolved: 1 }));
    const h = new HermesClient({ url: 'http://127.0.0.1:8642', key: 'private', fetcher });
    await h.approval('run/1', 'request-2', 'once');
    expect((fetcher.mock.calls as unknown as [string,RequestInit][])[0]?.[0]).toBe('http://127.0.0.1:8642/v1/runs/run%2F1/approval');
    const init = (fetcher.mock.calls as unknown as [string,RequestInit][])[0]![1];
    expect(JSON.parse(init.body as string)).toEqual({ request_id: 'request-2', choice: 'once' });
    await expect(h.approval('r', 'a', 'always' as 'once')).rejects.toThrow();
  });
  it('preserves idempotency and native stop acknowledgement', async () => {
    const fetcher = vi.fn(async () => Response.json({ run_id: 'r', status: 'stopping' }));
    const h = new HermesClient({ url:'http://localhost:8642',key:'private',fetcher });
    expect((await h.stop('r')).status).toBe('stopping');
    await h.start({ input:'research', instructions:'read only' }, 'request-a');
    expect((fetcher.mock.calls as unknown as [string,RequestInit][])[1]![1].headers).toMatchObject({ 'Idempotency-Key':'request-a' });
  });
  it('parses chunk-split SSE, ignores comments and rejects oversized frames', async () => {
    const chunks = [': open\r\n\r\nid: 2\r\nda', 'ta: {"event":"tool.started","seq":2}\r\n\r\n', 'data: {"event":"run.completed"}\n\n'];
    const stream = new ReadableStream<Uint8Array>({start(c){ for(const s of chunks)c.enqueue(new TextEncoder().encode(s));c.close(); }});
    const events = []; for await (const e of parseSse(stream)) events.push(e);
    expect(events.map(e=>e.data.event)).toEqual(['tool.started','run.completed']);
    expect(events[0]?.id).toBe('2');
  });
  it('never forwards upstream response bodies or keys in errors', async () => {
    const h = new HermesClient({url:'http://localhost:8642',key:'private',fetcher:async()=>new Response('private key leaked',{status:401})});
    await expect(h.capabilities()).rejects.toThrow('Hermes HTTP 401');
  });
});

it('rejects oversized or truncated native event frames instead of silently claiming complete replay',async()=>{
 for(const input of ['data: '+ 'x'.repeat(1_048_577),'data: {"event":"tool.started"}']){
  const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode(input));c.close();}});
  await expect((async()=>{for await(const _e of parseSse(stream)) { /* consume parser */ }})()).rejects.toThrow();
 }
});
