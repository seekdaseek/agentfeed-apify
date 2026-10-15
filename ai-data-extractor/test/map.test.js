import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanList, collectMany } from '../src/multi.js';
import { getAgentFeed } from '../src/agentfeed.js';
import { DEFAULT_SCHEMA, DEFAULT_URLS, EVENT_NAME, MAX_FIELDS, MAX_URLS, mapExtract, normalizeUrl, parseSchema, planInput } from '../src/map.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const T = '2026-10-15T10:30:00.000Z';
const URL_WIKI = 'https://en.wikipedia.org/wiki/Solana_(blockchain_platform)';
const KEY = 'afk_TESTKEYTESTKEYTESTKEYTESTKEYTESTKEYTESTKEY00';
const quiet = () => { const lines = []; return { lines, info: (m) => lines.push(['info', m]), warning: (m) => lines.push(['warning', m]), error: (m) => lines.push(['error', m]) }; };
const reply = (status, body) => new Response(JSON.stringify(body), { status });

test('the event name is a noun phrase key; the Store title for it is set in the Console as "Extracted page"', () => {
    assert.equal(EVENT_NAME, 'extracted-page');
});

test('normalizeUrl accepts http and https, rejects the rest', () => {
    assert.equal(normalizeUrl('https://a.test/x?y=1'), 'https://a.test/x?y=1');
    for (const bad of ['notaurl', 'ftp://a.test/x', 'file:///etc/passwd', 'https://user:pw@a.test/', 'javascript:alert(1)', `https://a.test/${'x'.repeat(2100)}`]) assert.equal(normalizeUrl(bad), null, bad);
});

test('parseSchema: an object or a JSON string of 1 to 20 fields with the five types', () => {
    assert.deepEqual(parseSchema({ title: 'string', price: 'number', in_stock: 'boolean', released: 'date', tags: 'string[]' }), { schema: { title: 'string', price: 'number', in_stock: 'boolean', released: 'date', tags: 'string[]' } });
    assert.deepEqual(parseSchema('{"a":"string"}'), { schema: { a: 'string' } });
    assert.deepEqual(parseSchema({ ' padded ': 'string' }), { schema: { padded: 'string' } });
});

test('parseSchema: every kind of bad schema is an error in plain words and names the field', () => {
    assert.match(parseSchema('{title:string').error, /not valid JSON/);
    assert.match(parseSchema([1]).error, /object that maps field names to types/);
    assert.match(parseSchema('"x"').error, /object that maps field names to types/);
    assert.match(parseSchema({ title: 'banana' }).error, /"title" has the type "banana"/);
    assert.match(parseSchema({ title: 5 }).error, /"title" has the type 5/);
    assert.match(parseSchema({}).error, /1 to 20 fields; it has 0/);
    assert.match(parseSchema({ a: 'string', ' a ': 'number' }).error, /"a" appears twice/);
    assert.match(parseSchema({ '': 'string' }).error, /1 to 64 characters/);
    assert.match(parseSchema({ ['x'.repeat(65)]: 'string' }).error, /1 to 64 characters/);
    const many = Object.fromEntries(Array.from({ length: MAX_FIELDS + 1 }, (_, i) => [`f${i}`, 'string']));
    assert.match(parseSchema(many).error, /it has 21/);
    const exactly = Object.fromEntries(Array.from({ length: MAX_FIELDS }, (_, i) => [`f${i}`, 'string']));
    assert.ok(parseSchema(exactly).schema);
});

test('planInput: with nothing at all it runs the default page and the default schema (the default run always returns data)', () => {
    for (const input of [{}, { urls: [], schema: {} }, { urls: null, schema: null }]) {
        const p = planInput(input, cleanList);
        assert.deepEqual(p.jobs, DEFAULT_URLS.map((name) => ({ name })));
        assert.deepEqual(p.schema, DEFAULT_SCHEMA);
        assert.equal(p.schemaJson, JSON.stringify(DEFAULT_SCHEMA));
        assert.equal(p.error, undefined);
    }
});

test('planInput: what the caller gave is never replaced by a default', () => {
    const urlsNoSchema = planInput({ urls: ['https://a.test/x'] }, cleanList);
    assert.match(urlsNoSchema.error, /schema is empty/);
    assert.equal(urlsNoSchema.jobs, undefined);
    const schemaNoUrls = planInput({ schema: { a: 'string' } }, cleanList);
    assert.match(schemaNoUrls.error, /at least one page or PDF URL/);
    const allBad = planInput({ urls: ['nope', 'ftp://a.test'], schema: { a: 'string' } }, cleanList);
    assert.match(allBad.error, /None of the URLs/);
    assert.equal(allBad.warnings.length, 2);
    const badSchema = planInput({ urls: ['https://a.test/x'], schema: { a: 'banana' } }, cleanList);
    assert.match(badSchema.error, /"a" has the type "banana"/);
});

test('planInput: good URLs run in order with the schema, a bad URL is a warning, duplicates and the limit are handled', () => {
    const p = planInput({ urls: ['https://a.test/1', 'nope', 'https://a.test/1', 'https://a.test/2'], schema: '{"t":"string"}' }, cleanList);
    assert.deepEqual(p.jobs, [{ name: 'https://a.test/1' }, { name: 'https://a.test/2' }]);
    assert.equal(p.schemaJson, '{"t":"string"}');
    assert.equal(p.warnings.length, 1);
    const many = planInput({ urls: Array.from({ length: MAX_URLS + 3 }, (_, i) => `https://a.test/${i}`), schema: { t: 'string' } }, cleanList);
    assert.equal(many.jobs.length, MAX_URLS);
    assert.equal(many.warnings.length, 3);
});

test('mapExtract: the real Wikipedia page becomes one item with the data, the counts and the null list', () => {
    const [item] = mapExtract(URL_WIKI, fx('wikipedia-solana.json'), T);
    assert.equal(item.url, URL_WIKI);
    assert.equal(item.kind, 'html');
    assert.equal(item.page_title, 'Solana (blockchain platform)');
    assert.deepEqual(item.data, { name: 'Solana', original_author: 'Anatoly Yakovenko, Raj Gokal', initial_release_year: 2020, consensus_mechanism: 'proof-of-stake', native_token: 'SOL' });
    assert.equal(item.fields_requested, 5);
    assert.equal(item.fields_found, 5);
    assert.deepEqual(item.null_fields, []);
    assert.equal(item.truncated, false);
    assert.equal(item.pct_read, 100);
    assert.equal(item.fetched_at, T);
});

test('mapExtract: a PDF with one field not stated keeps the null and lists it', () => {
    const [item] = mapExtract('https://bitcoin.org/bitcoin.pdf', fx('bitcoin-pdf.json'), T);
    assert.equal(item.kind, 'pdf');
    assert.equal(item.page_title, null);
    assert.equal(item.data.year, null);
    assert.equal(item.fields_requested, 4);
    assert.equal(item.fields_found, 3);
    assert.deepEqual(item.null_fields, ['year']);
    assert.ok(item.verbatim_fields.includes('abstract'));
});

test('mapExtract: a page that states none of the fields (all null, blank or empty list) is NOT an item, so it is not charged', () => {
    for (const data of [{ a: null, b: null }, { a: '', b: '   ' }, { a: [], b: null }, {}]) {
        assert.deepEqual(mapExtract('https://a.test/x', { data: { data, null_fields: Object.keys(data) } }, T), [], JSON.stringify(data));
    }
});

test('mapExtract: zero, false and a non-empty list are values that count as found', () => {
    const [item] = mapExtract('https://a.test/x', { data: { data: { n: 0, ok: false, tags: ['x'], gone: null }, null_fields: ['gone'] } }, T);
    assert.equal(item.fields_found, 3);
    assert.equal(item.fields_requested, 4);
});

test('mapExtract: a missing or malformed body is not an item', () => {
    for (const body of [null, undefined, {}, { data: null }, { data: {} }, { data: { data: null } }, { data: { data: [1] } }, { data: { data: 'x' } }, { error: 'x' }]) assert.deepEqual(mapExtract('https://a.test/x', body, T), [], JSON.stringify(body));
});

test('end to end: one good page is charged once; a 400, a 200 with every field null and a malformed answer are not', async () => {
    const answers = {
        'https://a.test/good': () => reply(200, fx('wikipedia-solana.json')),
        'https://a.test/bad': () => reply(400, { error: 'a.test answered HTTP 404' }),
        'https://a.test/empty': () => reply(200, { data: { data: { name: null }, null_fields: ['name'], kind: 'html' } }),
        'https://a.test/weird': () => reply(200, { data: { data: 'oops' } }),
    };
    const plan = planInput({ urls: Object.keys(answers), schema: { name: 'string' } }, cleanList);
    const charged = [];
    const log = quiet();
    const stats = await collectMany({
        jobs: plan.jobs,
        request: (job) => getAgentFeed('/api/extract', { url: job.name, schema: plan.schemaJson }, { key: KEY, fetchFn: async (url) => answers[new URL(url).searchParams.get('url')]() }),
        toItems: (job, body) => mapExtract(job.name, body, T),
        push: async (items) => { charged.push(...items.map((i) => i.url)); },
        log,
    });
    assert.deepEqual(charged, ['https://a.test/good']);
    assert.equal(stats.pushed, 1);
    assert.equal(stats.failed, 1);
    assert.equal(stats.empty, 2);
    assert.ok(log.lines.some(([, m]) => /HTTP 400: a\.test answered HTTP 404; no item pushed, nothing charged/.test(m)));
});

test('end to end: the request carries the schema as JSON in the query and the key only in the header', async () => {
    let seen;
    const plan = planInput({ urls: ['https://a.test/x'], schema: { title: 'string', tags: 'string[]' } }, cleanList);
    await collectMany({
        jobs: plan.jobs,
        request: (job) => getAgentFeed('/api/extract', { url: job.name, schema: plan.schemaJson }, { key: KEY, fetchFn: async (url, init) => { seen = { url: new URL(url), headers: init.headers }; return reply(200, fx('example-com.json')); } }),
        toItems: (job, body) => mapExtract(job.name, body, T),
        push: async () => {},
        log: quiet(),
    });
    assert.equal(seen.url.pathname, '/api/extract');
    assert.equal(seen.url.searchParams.get('url'), 'https://a.test/x');
    assert.deepEqual(JSON.parse(seen.url.searchParams.get('schema')), { title: 'string', tags: 'string[]' });
    assert.equal(seen.headers['X-AgentFeed-Key'], KEY);
    assert.ok(!String(seen.url).includes(KEY));
});

test('end to end: a rejected key stops the run before the second URL', async () => {
    let calls = 0;
    const plan = planInput({ urls: ['https://a.test/1', 'https://a.test/2'], schema: { t: 'string' } }, cleanList);
    const stats = await collectMany({
        jobs: plan.jobs,
        request: (job) => getAgentFeed('/api/extract', { url: job.name, schema: plan.schemaJson }, { key: KEY, fetchFn: async () => { calls++; return reply(402, { error: 'balance too low' }); } }),
        toItems: (job, body) => mapExtract(job.name, body, T),
        push: async () => assert.fail('nothing may be pushed'),
        log: quiet(),
    });
    assert.equal(calls, 1);
    assert.equal(stats.authFailed, true);
});

test('control: the empty-output rule can fail (a page with one stated field IS an item)', () => {
    assert.equal(mapExtract('https://a.test/x', { data: { data: { a: null, b: 'x' } } }, T).length, 1);
});
