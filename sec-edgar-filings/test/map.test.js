import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getAgentFeed } from '../src/agentfeed.js';
import { cleanList, collectMany } from '../src/multi.js';
import { DEFAULT_TICKERS, SOURCE, cleanForm, cleanLimit, mapFilings, normalizeTicker, planJobs } from '../src/map.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const any = fx('aapl-any.json');
const k8 = fx('aapl-8k.json');
const none = fx('aapl-no-filings.json');
const brkb = fx('brkb.json');
const T = '2026-10-14T15:40:00.000Z';

test('mapFilings: a real /api/sec-filings response becomes one item per filing with the documented fields', () => {
    const items = mapFilings('AAPL', any, T);
    assert.equal(items.length, any.data.filings.length);
    assert.equal(items.length, 10);
    items.forEach((it, i) => {
        const f = any.data.filings[i];
        assert.equal(it.ticker, 'AAPL');
        assert.equal(it.company, 'Apple Inc.');
        assert.equal(it.cik, '0000320193');
        assert.equal(it.form, f.form);
        assert.equal(it.filing_date, f.filed);
        assert.equal(it.report_date, f.report_date);
        assert.equal(it.accession_number, f.accession);
        assert.equal(it.description, f.description);
        assert.equal(it.items, f.items);
        assert.equal(it.document_url, f.document_url);
        assert.equal(it.index_url, f.index_url);
        assert.equal(it.source, SOURCE);
        assert.equal(it.fetched_at, T);
    });
    assert.match(items[0].index_url, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);
});

test('8-K items codes survive, and a ticker with a dash and null report dates map cleanly', () => {
    const eights = mapFilings('AAPL', k8, T);
    assert.ok(eights.length > 0 && eights.every((i) => i.form === '8-K'));
    assert.equal(eights[0].items, k8.data.filings[0].items);
    assert.match(eights[0].items, /^\d\.\d\d/);
    const b = mapFilings('BRK-B', brkb, T);
    assert.equal(b[0].ticker, 'BRK-B');
    assert.equal(b[0].report_date, null);
    assert.equal(b[0].description, null);
});

test('no items for nothing: the live 200 with count 0 (billed by the route), a body without filings, an entry without an accession number', () => {
    assert.equal(none.data.count, 0);
    assert.deepEqual(mapFilings('AAPL', none, T), []);
    assert.deepEqual(mapFilings('AAPL', {}, T), []);
    assert.deepEqual(mapFilings('AAPL', { data: { filings: 'x' } }, T), []);
    assert.deepEqual(mapFilings('AAPL', { data: { ticker: 'AAPL', filings: [{ form: '4' }] } }, T), []);
});

test('every item has the same keys, and a malformed filing does not throw', () => {
    const odd = mapFilings('X', { data: { filings: [{ accession: '1', form: 5, filed: null, items: ['x'] }] } }, T);
    assert.equal(odd[0].form, null);
    assert.equal(odd[0].items, null);
    assert.deepEqual(Object.keys(odd[0]), Object.keys(mapFilings('AAPL', any, T)[0]));
});

test('normalizeTicker, cleanForm, cleanLimit', () => {
    for (const ok of ['aapl', 'BRK-B', 'brk.b', 'A']) assert.ok(normalizeTicker(ok), ok);
    for (const bad of ['', 'TOOLONGTICKER', 'AA PL', 'A$', '../x']) assert.equal(normalizeTicker(bad), null, bad);
    assert.deepEqual(cleanForm(undefined), { form: null });
    assert.deepEqual(cleanForm('  '), { form: null });
    assert.deepEqual(cleanForm('10-k'), { form: '10-K' });
    assert.deepEqual(cleanForm('def  14a'), { form: 'DEF 14A' });
    assert.deepEqual(cleanForm('13f-hr'), { form: '13F-HR' });
    assert.match(cleanForm('bad;form').error, /not an EDGAR form type/);
    assert.equal(cleanLimit(undefined), 10);
    assert.equal(cleanLimit(0), 1);
    assert.equal(cleanLimit(500), 50);
    assert.equal(cleanLimit('12'), 12);
});

test('planJobs: empty input runs the default ticker; junk is reported not replaced; a bad form is an error and runs nothing', () => {
    assert.deepEqual(planJobs({}, cleanList).jobs, DEFAULT_TICKERS.map((name) => ({ name })));
    assert.deepEqual(planJobs({ tickers: [] }, cleanList).jobs, [{ name: 'AAPL' }]);
    const p = planJobs({ tickers: ['msft', 'MSFT', ' brk-b ', 'not a ticker!'], form: '8-k', limit_per_ticker: 3 }, cleanList);
    assert.deepEqual(p.jobs, [{ name: 'MSFT' }, { name: 'BRK-B' }]);
    assert.equal(p.form, '8-K');
    assert.equal(p.limit, 3);
    assert.equal(p.warnings.length, 1);
    assert.deepEqual(planJobs({ tickers: ['x'.repeat(30)] }, cleanList).jobs, [], 'a rejected ticker is not silently replaced by the default');
    const bad = planJobs({ tickers: ['AAPL'], form: 'x;y' }, cleanList);
    assert.deepEqual(bad.jobs, []);
    assert.match(bad.error, /EDGAR form type/);
});

test('end to end with the real client and mapper: a 400 ticker, a 503, an empty form answer push nothing; good tickers push one call each, one at a time', async () => {
    const calls = [];
    let inFlight = 0, maxInFlight = 0;
    const fetchFn = async (url) => {
        const u = new URL(url); calls.push(u.search);
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise((r) => setTimeout(r, 2)); inFlight--;
        const t = u.searchParams.get('ticker');
        if (t === 'ZZZZ') return new Response(JSON.stringify({ error: `unknown ticker ${t}: not in the SEC's company ticker list` }), { status: 400 });
        if (t === 'DOWN') return new Response(JSON.stringify({ error: 'EDGAR is slow or unreachable. Not charged.' }), { status: 503 });
        if (t === 'NOFORM') return new Response(JSON.stringify(none), { status: 200 });
        if (t === 'BRK-B') return new Response(JSON.stringify(brkb), { status: 200 });
        return new Response(JSON.stringify(any), { status: 200 });
    };
    const { jobs, limit } = planJobs({ tickers: ['AAPL', 'ZZZZ', 'DOWN', 'NOFORM', 'BRK-B'], limit_per_ticker: 10 }, cleanList);
    const pushes = [];
    const lines = [];
    const stats = await collectMany({
        jobs, label: (j) => `ticker ${j.name}`,
        request: (j) => getAgentFeed('/api/sec-filings', { ticker: j.name, limit }, { key: 'afk_x', fetchFn }),
        toItems: (j, b) => mapFilings(j.name, b, T),
        push: async (items) => { pushes.push(items.length); },
        log: { info() {}, error() {}, warning: (m) => lines.push(m) },
    });
    assert.deepEqual(pushes, [10, 2]);
    assert.equal(stats.failed, 2);
    assert.equal(stats.empty, 1);
    assert.equal(maxInFlight, 1);
    assert.ok(lines.some((m) => m.startsWith('ticker ZZZZ:') && m.includes('unknown ticker') && m.includes('nothing charged')));
    assert.ok(lines.some((m) => m.startsWith('ticker DOWN:') && m.includes('Not charged')));
    assert.ok(calls.every((s) => s.includes('limit=10')));
});
