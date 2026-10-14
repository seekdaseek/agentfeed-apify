import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getAgentFeed } from '../src/agentfeed.js';
import { cleanList, collectMany } from '../src/multi.js';
import { DEFAULT_URLS, SOURCE, countWords, mapPdf, normalizeUrl, planJobs } from '../src/map.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const bitcoin = fx('bitcoin-pdf.json');
const notPdf = fx('error-not-pdf.json');
const T = '2026-10-14T15:45:00.000Z';
const URL1 = 'https://bitcoin.org/bitcoin.pdf';

test('mapPdf: a real /api/pdf-markdown response becomes one item with the documented fields', () => {
    const [it] = mapPdf(URL1, bitcoin, T);
    const d = bitcoin.data;
    assert.equal(it.url, URL1);
    assert.equal(it.final_url, d.final_url);
    assert.equal(it.title, null);
    assert.equal(it.pages, 9);
    assert.equal(it.words, 3559, 'words of the text, without the 9 page headings (the route says 3586)');
    assert.equal(it.bytes, 184292);
    assert.equal(it.truncated, false);
    assert.equal(it.markdown, d.markdown);
    assert.match(it.markdown, /^## Page 1\n\nBitcoin: A Peer-to-Peer Electronic Cash System/);
    assert.equal(it.rights, d.rights);
    assert.equal(it.source, SOURCE);
    assert.equal(it.fetched_at, T);
    assert.deepEqual(DEFAULT_URLS, [URL1]);
});

test('the route\'s word_count includes the page headings, so the actor counts the words itself', () => {
    assert.equal(bitcoin.data.word_count, 3586);
    assert.equal(countWords(bitcoin.data.markdown), 3559);
    assert.equal(bitcoin.data.word_count - countWords(bitcoin.data.markdown), 27, '9 pages x 3 tokens ("##", "Page", "N")');
});

test('no item for no text: a scanned PDF converts to bare headings with a NON-ZERO route word_count, and must not be charged', () => {
    const scanned = { data: { title: null, url: 'u', final_url: 'u', pages: 4, bytes: 90000, word_count: 12, truncated: false, markdown: '## Page 1\n\n## Page 2\n\n## Page 3\n\n## Page 4' } };
    assert.deepEqual(mapPdf('u', scanned, T), []);
    assert.deepEqual(mapPdf('u', { data: { ...scanned.data, markdown: '   ' } }, T), []);
    assert.deepEqual(mapPdf('u', {}, T), []);
    assert.deepEqual(mapPdf('u', { data: { markdown: 5 } }, T), []);
    assert.equal(mapPdf('u', { data: { ...scanned.data, markdown: '## Page 1\n\nhello world\n\n## Page 2\n\n' } }, T)[0].words, 2);
    assert.equal(countWords('## Page 12\n\nthe page heading is not a word\n## Page 13'), 7);
});

test('truncated is carried through, and every item has the same keys', () => {
    const [cut] = mapPdf('u', { data: { ...bitcoin.data, truncated: true } }, T);
    assert.equal(cut.truncated, true);
    const [odd] = mapPdf('u', { data: { markdown: 'a b', pages: 'x', bytes: null, final_url: 5, truncated: 'yes' } }, T);
    assert.equal(odd.pages, null);
    assert.equal(odd.final_url, 'u');
    assert.equal(odd.truncated, false);
    assert.deepEqual(Object.keys(odd), Object.keys(mapPdf(URL1, bitcoin, T)[0]));
});

test('normalizeUrl accepts http and https and refuses everything else', () => {
    for (const ok of [URL1, 'http://example.com/a.pdf', 'https://example.com:8443/a.pdf?x=1#p=2']) assert.equal(normalizeUrl(ok), ok);
    for (const bad of ['', 'bitcoin.org/bitcoin.pdf', 'ftp://example.com/a.pdf', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:pw@example.com/a.pdf', `https://example.com/${'a'.repeat(2100)}`]) assert.equal(normalizeUrl(bad), null, bad.slice(0, 40));
});

test('planJobs: empty input runs the default PDF; junk is reported not replaced; duplicates collapse', () => {
    assert.deepEqual(planJobs({}, cleanList).jobs, [{ name: URL1 }]);
    assert.deepEqual(planJobs({ urls: [] }, cleanList).jobs, [{ name: URL1 }]);
    const p = planJobs({ urls: [URL1, URL1.toUpperCase().replace('HTTPS', 'https'), ' https://example.com/a.pdf ', 'not a url'] }, cleanList);
    assert.deepEqual(p.jobs, [{ name: URL1 }, { name: 'https://example.com/a.pdf' }]);
    assert.equal(p.warnings.length, 1);
    assert.deepEqual(planJobs({ urls: ['ftp://x/y.pdf'] }, cleanList).jobs, [], 'a rejected URL is not silently replaced by the default');
});

test('the URL travels as an encoded query parameter and the key only in the header', async () => {
    let seen;
    const fetchFn = async (url, init) => { seen = { url: new URL(url), key: init.headers['X-AgentFeed-Key'] }; return new Response(JSON.stringify(bitcoin), { status: 200 }); };
    await getAgentFeed('/api/pdf-markdown', { url: 'https://example.com/a b.pdf?x=1&y=2' }, { key: 'afk_x', fetchFn });
    assert.equal(seen.url.pathname, '/api/pdf-markdown');
    assert.equal(seen.url.searchParams.get('url'), 'https://example.com/a b.pdf?x=1&y=2');
    assert.equal([...seen.url.searchParams.keys()].length, 1);
    assert.equal(seen.key, 'afk_x');
});

// The brief's rule: an unknown input, a refused URL, a 4xx/5xx or a 503 returns no item and no charge.
test('end to end with the real client and mapper: a non-PDF (400), a private address (400), a 503 and a scan push nothing; the good PDF pushes once; one at a time', async () => {
    let inFlight = 0, maxInFlight = 0;
    const fetchFn = async (url) => {
        const u = new URL(url).searchParams.get('url');
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise((r) => setTimeout(r, 2)); inFlight--;
        if (u.includes('example.com')) return new Response(JSON.stringify(notPdf), { status: 400 });
        if (u.includes('127.0.0.1')) return new Response(JSON.stringify({ error: 'only ports 80 and 443 are fetched' }), { status: 400 });
        if (u.includes('slow.test')) return new Response(JSON.stringify({ error: 'the target did not answer in time. Not charged.' }), { status: 503 });
        if (u.includes('scan.test')) return new Response(JSON.stringify({ data: { word_count: 3, markdown: '## Page 1\n\n## Page 2\n\n## Page 3', pages: 3 } }), { status: 200 });
        return new Response(JSON.stringify(bitcoin), { status: 200 });
    };
    const { jobs } = planJobs({ urls: ['https://example.com/', 'http://127.0.0.1:3006/x.pdf', 'https://slow.test/a.pdf', 'https://scan.test/s.pdf', URL1] }, cleanList);
    const pushed = [];
    const lines = [];
    const stats = await collectMany({
        jobs, label: (j) => `PDF ${j.name}`,
        request: (j) => getAgentFeed('/api/pdf-markdown', { url: j.name }, { key: 'afk_x', fetchFn }),
        toItems: (j, b) => mapPdf(j.name, b, T),
        push: async (items) => { pushed.push(...items.map((i) => i.url)); },
        log: { info() {}, error() {}, warning: (m) => lines.push(m) },
    });
    assert.deepEqual(pushed, [URL1]);
    assert.equal(stats.failed, 3);
    assert.equal(stats.empty, 1);
    assert.equal(maxInFlight, 1);
    assert.ok(lines.some((m) => m.includes('example.com') && m.includes('content type text/html') && m.includes('nothing charged')));
    assert.ok(lines.some((m) => m.includes('scan.test') && m.includes('nothing to return')));
});

// test/fixtures/scanned.pdf is served from raw.githubusercontent.com for the live check of this rule (the host's robots.txt answers 404).
// It is one page holding one picture of text and no text layer: pdfminer and pypdf both read 0 words and 0 fonts from it.
const looksImageOnly = (buf) => buf.subarray(0, 5).toString('latin1') === '%PDF-' && buf.includes('/Subtype /Image') && !buf.includes('/Font');

test('fixture scanned.pdf is a small image-only PDF, and the check can tell a PDF with fonts apart', () => {
    const buf = fs.readFileSync(new URL('./fixtures/scanned.pdf', import.meta.url));
    assert.ok(buf.length > 10000 && buf.length < 200000, `size ${buf.length}`);
    assert.ok(looksImageOnly(buf));
    assert.equal(looksImageOnly(Buffer.from('%PDF-1.4 /Subtype /Image /Font')), false, 'control: a PDF that declares a font is not image-only');
    assert.equal(looksImageOnly(Buffer.from('not a pdf /Subtype /Image')), false);
});
