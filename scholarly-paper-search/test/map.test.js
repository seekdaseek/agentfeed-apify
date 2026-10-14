import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getAgentFeed } from '../src/agentfeed.js';
import { cleanList, collectMany } from '../src/multi.js';
import { DEFAULT_DOIS, DEFAULT_QUERIES, LICENSE, SOURCE, cleanLimit, cleanYear, mapDoi, mapSearch, normalizeDoi, planJobs } from '../src/map.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const search = fx('papers-search.json');
const doi = fx('paper-doi-nature14539.json');
const doiAbstract = fx('paper-doi-with-abstract.json');
const empty = fx('papers-empty.json');
const quiet = { info() {}, warning() {}, error() {} };
const T = '2026-10-14T15:30:00.000Z';

test('mapSearch: a real /api/papers response becomes one item per paper, stamped with its query', () => {
    const items = mapSearch('large language models', search, T);
    const papers = search.data.papers;
    assert.equal(items.length, papers.length);
    assert.equal(items.length, 10);
    items.forEach((it, i) => {
        assert.equal(it.query, 'large language models');
        assert.equal(it.title, papers[i].title);
        assert.equal(it.year, papers[i].year);
        assert.equal(it.doi, papers[i].doi);
        assert.deepEqual(it.authors, papers[i].authors);
        assert.equal(it.cited_by_count, papers[i].cited_by);
        assert.equal(it.is_open_access, papers[i].open_access.is_oa);
        assert.equal(it.open_access_url, papers[i].open_access.url);
        assert.equal(it.openalex_id, papers[i].openalex_id);
        assert.equal(it.abstract, null, 'search results carry no abstract');
        assert.equal(it.source, SOURCE);
        assert.equal(it.license, 'CC0');
        assert.equal(it.fetched_at, T);
    });
    assert.equal(LICENSE, 'CC0');
});

test('mapDoi: a real /api/paper/:doi response becomes one item with query null; the abstract is kept when OpenAlex holds one', () => {
    const [a] = mapDoi('10.1038/nature14539', doi, T);
    assert.equal(a.query, null);
    assert.equal(a.title, 'Deep learning');
    assert.equal(a.doi, '10.1038/nature14539');
    assert.equal(a.cited_by_count, doi.data.cited_by);
    assert.equal(a.abstract, null);
    const [b] = mapDoi('10.48550/arxiv.1706.03762', doiAbstract, T);
    assert.equal(typeof b.abstract, 'string');
    assert.ok(b.abstract.length > 500);
    assert.equal(b.abstract, doiAbstract.data.abstract);
});

test('no items for nothing: the live 200 with zero papers, a body without data, a DOI answer without title or doi', () => {
    assert.equal(empty.data.returned, 0);
    assert.deepEqual(mapSearch('zz', empty, T), []);
    assert.deepEqual(mapSearch('zz', {}, T), []);
    assert.deepEqual(mapSearch('zz', { data: { papers: 'x' } }, T), []);
    assert.deepEqual(mapDoi('10.1/x', {}, T), []);
    assert.deepEqual(mapDoi('10.1/x', { data: { abstract: 'only' } }, T), []);
});

test('a malformed paper is mapped without throwing, and every item has the same keys', () => {
    const items = mapSearch('q', { data: { papers: [{ title: 'T', authors: [1, 'A'], cited_by: 'x', open_access: null }] } }, T);
    assert.equal(items[0].cited_by_count, null);
    assert.deepEqual(items[0].authors, ['A']);
    assert.equal(items[0].is_open_access, false);
    assert.deepEqual(Object.keys(items[0]), Object.keys(mapSearch('q', search, T)[0]));
});

test('normalizeDoi accepts the usual spellings and refuses the rest', () => {
    for (const ok of ['10.1038/nature14539', 'doi:10.1038/nature14539', 'DOI: 10.1038/nature14539', 'https://doi.org/10.1038/nature14539', 'http://dx.doi.org/10.1038/nature14539', '10.1038%2Fnature14539']) assert.equal(normalizeDoi(ok), '10.1038/nature14539', ok);
    for (const bad of ['', 'nature14539', '10.1038', 'https://example.com/10.1038/x', '10.12/x', `10.1038/${'a'.repeat(200)}`]) assert.equal(normalizeDoi(bad), null, bad);
});

test('cleanYear and cleanLimit', () => {
    const now = new Date('2026-10-14T00:00:00Z');
    assert.deepEqual(cleanYear(undefined, now), { year: null });
    assert.deepEqual(cleanYear('', now), { year: null });
    assert.deepEqual(cleanYear(2022, now), { year: 2022 });
    assert.deepEqual(cleanYear('2022', now), { year: 2022 });
    assert.equal(cleanYear(2028, now).year, null);
    assert.match(cleanYear(2028, now).warning, /four-digit year/);
    assert.equal(cleanYear(99, now).year, null);
    assert.equal(cleanYear('abc', now).year, null);
    assert.equal(cleanLimit(undefined), 10);
    assert.equal(cleanLimit(0), 1);
    assert.equal(cleanLimit(99), 25);
    assert.equal(cleanLimit('7'), 7);
    assert.equal(cleanLimit('x'), 10);
});

test('planJobs: an empty input runs the defaults (a query and a DOI); asking for only queries adds no DOI; junk is reported, not run', () => {
    const none = planJobs({}, cleanList);
    assert.deepEqual(none.jobs, [...DEFAULT_QUERIES.map((name) => ({ kind: 'query', name })), ...DEFAULT_DOIS.map((name) => ({ kind: 'doi', name }))]);
    assert.deepEqual(planJobs({ queries: [], dois: [] }, cleanList).jobs, none.jobs);
    const onlyQ = planJobs({ queries: ['graph neural networks'] }, cleanList);
    assert.deepEqual(onlyQ.jobs, [{ kind: 'query', name: 'graph neural networks' }]);
    const mixed = planJobs({ queries: ['a', 'A', ' b  c ', 'x'.repeat(201)], dois: ['https://doi.org/10.1038/NATURE14539', '10.1038/nature14539', 'junk'], year_from: 2030, max_results_per_query: 50 }, cleanList, new Date('2026-10-14T00:00:00Z'));
    assert.deepEqual(mixed.jobs, [{ kind: 'query', name: 'a' }, { kind: 'query', name: 'b c' }, { kind: 'doi', name: '10.1038/NATURE14539' }]);
    assert.equal(mixed.year, null);
    assert.equal(mixed.limit, 25);
    assert.equal(mixed.warnings.length, 3);
    const onlyJunk = planJobs({ queries: ['x'.repeat(300)] }, cleanList);
    assert.deepEqual(onlyJunk.jobs, [], 'a rejected input is not silently replaced by the defaults');
});

test('the DOI slash travels as %2F in the path, and the key only in the header', async () => {
    let seen;
    const fetchFn = async (url, init) => { seen = { url: String(url), key: init.headers['X-AgentFeed-Key'] }; return new Response(JSON.stringify(doi), { status: 200 }); };
    await getAgentFeed(`/api/paper/${encodeURIComponent('10.1038/nature14539')}`, {}, { key: 'afk_x', fetchFn });
    assert.equal(seen.url, 'https://x402.ochinimus.app/api/paper/10.1038%2Fnature14539');
    assert.equal(seen.key, 'afk_x');
});

// The brief's rule: an unknown input, an AgentFeed 4xx/5xx or a 503 returns no item and no charge. Charging happens inside push().
test('end to end with the real client and mappers: a 503 search, a 400 DOI and an empty search push nothing; good inputs push one call each, one job at a time', async () => {
    const calls = [];
    let inFlight = 0, maxInFlight = 0;
    const fetchFn = async (url) => {
        const u = new URL(url); calls.push(u.pathname + u.search);
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise((r) => setTimeout(r, 2)); inFlight--;
        if (u.searchParams.get('q') === 'capped') return new Response(JSON.stringify({ error: 'the daily OpenAlex search allowance (90) is used up; it resets at 00:00 UTC. Not charged.' }), { status: 503 });
        if (u.searchParams.get('q') === 'nothing') return new Response(JSON.stringify(empty), { status: 200 });
        if (u.pathname.endsWith('does-not-exist')) return new Response(JSON.stringify({ error: 'OpenAlex has no record for DOI 10.9999/does-not-exist' }), { status: 400 });
        if (u.pathname.startsWith('/api/paper/')) return new Response(JSON.stringify(doi), { status: 200 });
        return new Response(JSON.stringify(search), { status: 200 });
    };
    const { jobs, limit } = planJobs({ queries: ['capped', 'nothing', 'large language models'], dois: ['10.9999/does-not-exist', '10.1038/nature14539'], max_results_per_query: 10 }, cleanList);
    const pushes = [];
    const lines = [];
    const log = { info() {}, error() {}, warning: (m) => lines.push(m) };
    const stats = await collectMany({
        jobs, label: (j) => `${j.kind} "${j.name}"`,
        request: (j) => (j.kind === 'doi' ? getAgentFeed(`/api/paper/${encodeURIComponent(j.name)}`, {}, { key: 'afk_x', fetchFn }) : getAgentFeed('/api/papers', { q: j.name, limit }, { key: 'afk_x', fetchFn })),
        toItems: (j, b) => (j.kind === 'doi' ? mapDoi(j.name, b, T) : mapSearch(j.name, b, T)),
        push: async (items) => { pushes.push(items.length); },
        log,
    });
    assert.deepEqual(pushes, [10, 1]);
    assert.equal(stats.pushed, 11);
    assert.equal(stats.failed, 2);
    assert.equal(stats.empty, 1);
    assert.equal(maxInFlight, 1);
    assert.ok(lines.some((m) => m.startsWith('query "capped":') && m.includes('allowance') && m.includes('nothing charged')));
    assert.ok(lines.some((m) => m.startsWith('doi "10.9999/does-not-exist":') && m.includes('no record')));
    assert.ok(calls.includes('/api/paper/10.9999%2Fdoes-not-exist'));
});
