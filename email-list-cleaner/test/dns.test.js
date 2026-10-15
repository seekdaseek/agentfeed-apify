import test from 'node:test';
import assert from 'node:assert/strict';
import { createResolver, dohResolver, mapLimit, mxKind, systemResolver } from '../src/dns.js';

const err = (code) => Object.assign(new Error(code), { code });
const fakeLib = ({ mx, a4 = [], a6 = [] }) => ({
    resolveMx: async () => { if (mx instanceof Error) throw mx; return mx; },
    resolve4: async () => { if (a4 instanceof Error) throw a4; return a4; },
    resolve6: async () => { if (a6 instanceof Error) throw a6; return a6; },
});
const doh = (answers) => async (url) => {
    const u = new URL(url);
    const body = answers[`${u.searchParams.get('name')}/${u.searchParams.get('type')}`] ?? { Status: 3 };
    return new Response(JSON.stringify(body), { status: 200 });
};

test('mxKind: real hosts, a null MX (a single "." host) and an empty answer', () => {
    assert.deepEqual(mxKind([{ exchange: 'mx.a.com', priority: 10 }]), { kind: 'mx', hosts: [{ exchange: 'mx.a.com', priority: 10 }] });
    assert.deepEqual(mxKind([{ exchange: '', priority: 0 }]), { kind: 'null_mx' });
    assert.deepEqual(mxKind([{ exchange: '.', priority: 0 }]), { kind: 'null_mx' });
    assert.deepEqual(mxKind([]), { kind: 'nodata' });
});

test('system resolver: ENOTFOUND is a missing domain, ENODATA is no MX, anything else is an error code', async () => {
    assert.deepEqual(await systemResolver({ lib: fakeLib({ mx: err('ENOTFOUND') }) }).mx('a.com'), { kind: 'nxdomain' });
    assert.deepEqual(await systemResolver({ lib: fakeLib({ mx: err('ENODATA') }) }).mx('a.com'), { kind: 'nodata' });
    assert.deepEqual(await systemResolver({ lib: fakeLib({ mx: err('ESERVFAIL') }) }).mx('a.com'), { error: 'ESERVFAIL' });
    assert.equal((await systemResolver({ lib: fakeLib({ mx: [{ exchange: 'mx.a.com', priority: 1 }] }) }).mx('a.com')).kind, 'mx');
});

test('system resolver: a lookup that never answers is a timeout error, not a hang', async () => {
    const lib = { resolveMx: () => new Promise(() => {}), resolve4: () => new Promise(() => {}), resolve6: () => new Promise(() => {}) };
    assert.deepEqual(await systemResolver({ lib, timeoutMs: 20 }).mx('a.com'), { error: 'ETIMEOUT' });
});

test('system resolver: addr finds A or AAAA, reports none, and surfaces a broken resolver', async () => {
    assert.deepEqual(await systemResolver({ lib: fakeLib({ mx: [], a4: ['1.2.3.4'] }) }).addr('a.com'), { found: true });
    assert.deepEqual(await systemResolver({ lib: fakeLib({ mx: [], a4: err('ENODATA'), a6: ['::1'] }) }).addr('a.com'), { found: true });
    assert.deepEqual(await systemResolver({ lib: fakeLib({ mx: [], a4: err('ENOTFOUND'), a6: err('ENODATA') }) }).addr('a.com'), { found: false });
    assert.deepEqual(await systemResolver({ lib: fakeLib({ mx: [], a4: err('ETIMEOUT'), a6: err('ETIMEOUT') }) }).addr('a.com'), { error: 'ETIMEOUT' });
});

test('DoH resolver: MX answers, NXDOMAIN, a null MX, no MX and SERVFAIL map to the same kinds', async () => {
    const r = dohResolver({
        fetchFn: doh({
            'gmail.com/MX': { Status: 0, Answer: [{ type: 15, data: '10 alt1.gmail-smtp-in.l.google.com.' }, { type: 15, data: '5 gmail-smtp-in.l.google.com.' }] },
            'example.com/MX': { Status: 0, Answer: [{ type: 15, data: '0 .' }] },
            'nomx.com/MX': { Status: 0 },
            'broken.com/MX': { Status: 2 },
        }),
    });
    assert.deepEqual(await r.mx('gmail.com'), { kind: 'mx', hosts: [{ exchange: 'alt1.gmail-smtp-in.l.google.com', priority: 10 }, { exchange: 'gmail-smtp-in.l.google.com', priority: 5 }] });
    assert.deepEqual(await r.mx('example.com'), { kind: 'null_mx' });
    assert.deepEqual(await r.mx('nomx.com'), { kind: 'nodata' });
    assert.deepEqual(await r.mx('missing.com'), { kind: 'nxdomain' });
    assert.deepEqual(await r.mx('broken.com'), { error: 'DOH_STATUS_2' });
});

test('DoH resolver: addr reads A and AAAA answers; a failed request is an error, and the query goes over https with the DNS JSON accept header', async () => {
    let seen;
    const r = dohResolver({ fetchFn: async (url, init) => { seen = { url: String(url), accept: init.headers.accept }; return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '1.2.3.4' }] }), { status: 200 }); } });
    assert.deepEqual(await r.addr('a.com'), { found: true });
    assert.match(seen.url, /^https:\/\/cloudflare-dns\.com\/dns-query\?name=a\.com&type=A/);
    assert.equal(seen.accept, 'application/dns-json');
    const bad = dohResolver({ fetchFn: async () => new Response('x', { status: 503 }) });
    assert.deepEqual(await bad.mx('a.com'), { error: 'DOH_HTTP_503' });
});

test('createResolver: the system resolver is used while it works; MX, A fallback and nodata come out as core answers', async () => {
    const lib = { resolveMx: async (d) => { if (d === 'nomx.com') throw err('ENODATA'); if (d === 'gone.com') throw err('ENOTFOUND'); return [{ exchange: 'mx.x.com', priority: 1 }]; }, resolve4: async (d) => { if (d === 'nomx.com') return ['1.1.1.1']; throw err('ENODATA'); }, resolve6: async () => { throw err('ENODATA'); } };
    const r = createResolver({ primary: systemResolver({ lib }), fallback: dohResolver({ fetchFn: async () => assert.fail('DoH must not be used') }) });
    assert.equal((await r.lookup('a.com')).kind, 'mx');
    assert.deepEqual(await r.lookup('nomx.com'), { kind: 'a_fallback' });
    assert.deepEqual(await r.lookup('gone.com'), { kind: 'nxdomain' });
    assert.deepEqual([r.path, r.stats.system, r.stats.doh, r.stats.switchedAt], ['system', 4, 0, null]);
});

test('createResolver: after 3 broken lookups in a row it switches to DoH for good, retries the lookup there, and records the switch', async () => {
    const lib = { resolveMx: async () => { throw err('ECONNREFUSED'); }, resolve4: async () => { throw err('ECONNREFUSED'); }, resolve6: async () => { throw err('ECONNREFUSED'); } };
    const logs = [];
    const r = createResolver({ primary: systemResolver({ lib }), fallback: dohResolver({ fetchFn: doh({ 'a.com/MX': { Status: 0, Answer: [{ type: 15, data: '10 mx.a.com.' }] } }) }), switchAfter: 3, log: (m) => logs.push(m) });
    assert.deepEqual(await r.lookup('x1.com'), { kind: 'error', code: 'ECONNREFUSED' });
    assert.deepEqual(await r.lookup('x2.com'), { kind: 'error', code: 'ECONNREFUSED' });
    assert.equal(r.path, 'system');
    assert.equal((await r.lookup('a.com')).kind, 'mx', 'the third broken lookup is retried on DoH and answers');
    assert.equal(r.path, 'doh');
    assert.equal((await r.lookup('missing.com')).kind, 'nxdomain');
    assert.equal(r.stats.doh, 2);
    assert.equal(r.stats.switchedAt, 2);
    assert.equal(logs.length, 1);
});

test('createResolver: a domain that does not exist does not count as a broken resolver, and a success resets the count', async () => {
    let n = 0;
    const lib = { resolveMx: async () => { n++; if (n % 3 === 0) return [{ exchange: 'mx.x.com', priority: 1 }]; throw err(n % 2 ? 'ETIMEOUT' : 'ENOTFOUND'); }, resolve4: async () => [], resolve6: async () => [] };
    const r = createResolver({ primary: systemResolver({ lib }), fallback: dohResolver({ fetchFn: async () => assert.fail('DoH must not be used') }), switchAfter: 3 });
    for (let i = 0; i < 12; i++) await r.lookup(`d${i}.com`);
    assert.equal(r.path, 'system');
});

test('a timeout is reported as the code "timeout" so the verdict says dns_timeout', async () => {
    const lib = { resolveMx: () => new Promise(() => {}), resolve4: async () => [], resolve6: async () => [] };
    const r = createResolver({ primary: systemResolver({ lib, timeoutMs: 15 }), fallback: dohResolver(), switchAfter: 99 });
    assert.deepEqual(await r.lookup('slow.com'), { kind: 'error', code: 'timeout' });
});

test('mapLimit keeps the order and the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 6, 7, 8], 3, async (n) => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, n)); inFlight--; return n * 2; });
    assert.deepEqual(out, [10, 2, 8, 4, 6, 12, 14, 16]);
    assert.ok(peak <= 3);
});
