import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AUTH_STATUSES, cleanNames, collect, getAgentFeed } from '../shared/agentfeed.js';

const KEY = 'afk_TESTKEYTESTKEYTESTKEYTESTKEYTESTKEYTESTKEY00';
const quiet = () => { const lines = []; return { lines, info: (m) => lines.push(['info', m]), warning: (m) => lines.push(['warning', m]), error: (m) => lines.push(['error', m]) }; };
const reply = (status, body, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });

test('every actor\'s src/agentfeed.js is byte-identical to shared/agentfeed.js', () => {
    const root = new URL('../', import.meta.url);
    const shared = fs.readFileSync(new URL('shared/agentfeed.js', root), 'utf8');
    const actors = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(new URL(`${e.name}/.actor/actor.json`, root))).map((e) => e.name);
    assert.ok(actors.length > 0, 'found no actor folders');
    for (const actor of actors) {
        assert.equal(fs.readFileSync(new URL(`${actor}/src/agentfeed.js`, root), 'utf8'), shared, `${actor}/src/agentfeed.js drifted: run npm run sync`);
    }
});

test('getAgentFeed sends the key only in the X-AgentFeed-Key header, never in the URL', async () => {
    let seen;
    const fetchFn = async (url, init) => { seen = { url: String(url), headers: init.headers }; return reply(200, { data: {} }); };
    const res = await getAgentFeed('/api/hl-whales', { coin: 'BTC' }, { key: KEY, fetchFn });
    assert.equal(res.ok, true);
    assert.equal(seen.url, 'https://x402.ochinimus.app/api/hl-whales?coin=BTC');
    assert.equal(seen.headers['X-AgentFeed-Key'], KEY);
    assert.ok(!seen.url.includes(KEY));
});

test('getAgentFeed: non-200 is ok:false with the status and the route\'s error text', async () => {
    const res = await getAgentFeed('/api/hl-whales', { coin: 'NOPE' }, { key: KEY, fetchFn: async () => reply(400, { error: 'unknown Hyperliquid perp NOPE' }) });
    assert.deepEqual(res, { ok: false, status: 400, reason: 'HTTP 400: unknown Hyperliquid perp NOPE' });
});

test('getAgentFeed: a thrown fetch (network, timeout) is ok:false status 0, and the key is not in the reason', async () => {
    const res = await getAgentFeed('/x', {}, { key: KEY, fetchFn: async () => { throw Object.assign(new Error(`boom ${KEY}`), { name: 'TimeoutError' }); } });
    assert.equal(res.ok, false);
    assert.equal(res.status, 0);
    assert.ok(!res.reason.includes(KEY));
});

test('getAgentFeed: 200 with a body that is not JSON is ok:false', async () => {
    const res = await getAgentFeed('/x', {}, { key: KEY, fetchFn: async () => reply(200, '<html>edge page</html>') });
    assert.equal(res.ok, false);
    assert.match(res.reason, /not JSON/);
});

test('getAgentFeed: one 429 is retried after Retry-After (capped at 10 s), then succeeds', async () => {
    const waits = [];
    let calls = 0;
    const fetchFn = async () => (++calls === 1 ? reply(429, { error: 'key rate limit' }, { 'retry-after': '99' }) : reply(200, { data: { ok: 1 } }));
    const res = await getAgentFeed('/x', {}, { key: KEY, fetchFn, sleep: async (ms) => { waits.push(ms); } });
    assert.equal(res.ok, true);
    assert.equal(calls, 2);
    assert.deepEqual(waits, [10000]);
});

test('getAgentFeed: a second 429 gives up as ok:false 429', async () => {
    const res = await getAgentFeed('/x', {}, { key: KEY, fetchFn: async () => reply(429, {}), sleep: async () => {} });
    assert.equal(res.ok, false);
    assert.equal(res.status, 429);
});

test('collect: a failed upstream call pushes NO item, the loop continues, only good coins are pushed', async () => {
    const pushed = [];
    const log = quiet();
    const stats = await collect({
        names: ['BTC', 'NOPE', 'SOL'],
        request: async (n) => (n === 'NOPE' ? { ok: false, status: 400, reason: 'HTTP 400: unknown Hyperliquid perp NOPE' } : { ok: true, body: { n } }),
        toItem: (n) => ({ coin: n }),
        push: async (item) => { pushed.push(item.coin); },
        log,
    });
    assert.deepEqual(pushed, ['BTC', 'SOL']);
    assert.equal(stats.failed, 1);
    assert.equal(stats.pushed, 2);
    assert.ok(log.lines.some(([lvl, m]) => lvl === 'warning' && m.startsWith('NOPE:') && m.includes('nothing charged')));
});

test('collect: a 200 that maps to nothing (empty tape) pushes no item', async () => {
    const pushed = [];
    const stats = await collect({ names: ['A', 'B'], request: async () => ({ ok: true, body: {} }), toItem: (n) => (n === 'A' ? null : { n }), push: async (i) => { pushed.push(i); }, log: quiet() });
    assert.deepEqual(pushed, [{ n: 'B' }]);
    assert.equal(stats.empty, 1);
});

test('collect: a mapper that throws is treated as no data, not a crash and not a charge', async () => {
    const pushed = [];
    const stats = await collect({ names: ['A'], request: async () => ({ ok: true, body: {} }), toItem: () => { throw new Error('bad shape'); }, push: async (i) => { pushed.push(i); }, log: quiet() });
    assert.equal(pushed.length, 0);
    assert.equal(stats.empty, 1);
});

test('collect: a rejected key (401, 402, 403) stops the loop at once and pushes nothing further', async () => {
    for (const status of AUTH_STATUSES) {
        let requests = 0;
        const pushed = [];
        const stats = await collect({ names: ['A', 'B', 'C'], request: async () => { requests++; return { ok: false, status, reason: `HTTP ${status}` }; }, toItem: () => ({}), push: async (i) => { pushed.push(i); }, log: quiet() });
        assert.equal(requests, 1, `status ${status}`);
        assert.equal(pushed.length, 0);
        assert.equal(stats.authFailed, true);
    }
});

test('collect: eventChargeLimitReached stops the loop after the item that hit the cap', async () => {
    let requests = 0;
    const stats = await collect({ names: ['A', 'B', 'C'], request: async () => { requests++; return { ok: true, body: {} }; }, toItem: (n) => ({ n }), push: async () => ({ eventChargeLimitReached: true }), log: quiet() });
    assert.equal(requests, 1);
    assert.equal(stats.pushed, 1);
    assert.equal(stats.limitReached, true);
});

test('cleanNames: trims, upper-cases, dedupes, rejects bad symbols, falls back to the default for an empty list', () => {
    const pattern = /^[A-Z0-9]{1,15}$/;
    assert.deepEqual(cleanNames([' btc ', 'BTC', 'eth', '', null, 'bad symbol!', '../x'], pattern, ['SOL']), { valid: ['BTC', 'ETH'], rejected: ['bad symbol!', '../x'] });
    assert.deepEqual(cleanNames([], pattern, ['SOL']), { valid: ['SOL'], rejected: [] });
    assert.deepEqual(cleanNames(undefined, pattern, ['SOL']), { valid: ['SOL'], rejected: [] });
});
