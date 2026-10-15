import test from 'node:test';
import assert from 'node:assert/strict';
import { createCleaner } from '../src/clean.js';

const DISP = new Set(['mailinator.com']);
const MX = (host) => ({ kind: 'mx', hosts: [{ exchange: host, priority: 10 }] });
const TABLE = {
    'gmail.com': MX('gmail-smtp-in.l.google.com'), 'acme.com': MX('acme-com.mail.protection.outlook.com'), 'mailinator.com': MX('mx.mailinator.com'), 'gmial.com': MX('mx.gmial.example'),
    'nullmx.com': { kind: 'null_mx' }, 'dead.test-af.com': { kind: 'nxdomain' }, 'afallback.com': { kind: 'a_fallback' }, 'slow.com': { kind: 'error', code: 'timeout' },
};
const makeCleaner = (opts = {}) => {
    const calls = [];
    const cleaner = createCleaner({ lookup: async (d) => { calls.push(d); return TABLE[d] ?? { kind: 'nxdomain' }; }, disposableSet: DISP, ...opts });
    return { cleaner, calls };
};
const summarize = (out) => out.map((o) => `${o.record.email ?? o.record.input}:${o.record.status}${o.charged ? '$' : ''}`);

test('a mixed list: every class gets its verdict, in input order, and only verdicts are charged', async () => {
    const { cleaner } = makeCleaner();
    const out = await cleaner.process([
        'Jane@Gmail.com', 'mailto:info@acme.com', 'john@gmial.com', 'logo@2x.png', 'abc@sentry.io', 'x@example.com', 'a@mailinator.com',
        'a@nullmx.com', 'b@dead.test-af.com', 'c@afallback.com', 'd@slow.com', 'hello', '', '   ', 7, null,
    ]);
    assert.deepEqual(summarize(out), [
        'Jane@gmail.com:valid$', 'info@acme.com:risky$', 'john@gmial.com:risky$', 'logo@2x.png:invalid$', 'abc@sentry.io:invalid$', 'x@example.com:invalid$',
        'a@mailinator.com:risky$', 'a@nullmx.com:invalid$', 'b@dead.test-af.com:invalid$', 'c@afallback.com:risky$', 'd@slow.com:unknown', 'hello:invalid',
    ]);
    const c = cleaner.counters;
    assert.deepEqual([c.lines, c.blank, c.rejected, c.unique], [12, 2, 2, 12]);
    assert.deepEqual([c.valid, c.risky, c.invalid, c.unknown, c.charged, c.not_an_email, c.junk, c.fixed], [1, 4, 6, 1, 10, 1, 3, 2]);
    assert.equal(c.charged, out.filter((o) => o.charged).length);
});

test('dedupe on: a repeat produces no row and is not charged, within a batch and across batches; the case of the address does not matter', async () => {
    const { cleaner } = makeCleaner();
    const first = await cleaner.process(['jane@acme.com', 'JANE@acme.com', 'jane@acme.com', 'bob@acme.com']);
    assert.deepEqual(summarize(first), ['jane@acme.com:valid$', 'bob@acme.com:valid$']);
    const second = await cleaner.process(['jane@acme.com', 'new@acme.com']);
    assert.deepEqual(summarize(second), ['new@acme.com:valid$']);
    assert.deepEqual([cleaner.counters.duplicates, cleaner.counters.unique, cleaner.counters.charged], [3, 3, 3]);
});

test('dedupe off: a repeat is a row that copies the first verdict, names the first input in duplicate_of and is never charged', async () => {
    const { cleaner } = makeCleaner({ dedupe: false });
    const out = await cleaner.process(['Info@Acme.com', 'info@acme.com']);
    assert.equal(out.length, 2);
    assert.deepEqual([out[0].charged, out[1].charged], [true, false]);
    assert.equal(out[1].record.duplicate_of, 'Info@Acme.com');
    assert.equal(out[1].record.status, out[0].record.status);
    assert.equal(out[1].record.input, 'info@acme.com');
    const again = await cleaner.process(['INFO@acme.com']);
    assert.deepEqual([again[0].charged, again[0].record.duplicate_of], [false, 'Info@Acme.com']);
    assert.deepEqual([cleaner.counters.charged, cleaner.counters.duplicates], [1, 2]);
});

test('one DNS lookup per domain, however many addresses use it, and none for syntax errors, junk or repeats', async () => {
    const { cleaner, calls } = makeCleaner();
    await cleaner.process(['a@acme.com', 'b@acme.com', 'c@acme.com', 'd@gmail.com', 'logo@2x.png', 'x@example.com', 'bad@@x.com', 'a@acme.com']);
    await cleaner.process(['e@acme.com', 'f@gmail.com']);
    assert.deepEqual(calls.sort(), ['acme.com', 'gmail.com']);
    assert.equal(cleaner.domainCount(), 2);
});

test('the charged count of a run equals the unique addresses with a verdict (the rule the price rests on)', async () => {
    const { cleaner } = makeCleaner();
    const lines = ['a@acme.com', 'a@acme.com', 'A@ACME.COM', 'b@slow.com', 'not an email', 'logo@2x.png', 'logo@2x.png', 'c@gmail.com', '', 'info@acme.com'];
    const out = await cleaner.process(lines);
    const charged = out.filter((o) => o.charged);
    assert.equal(charged.length, 4);
    assert.deepEqual(charged.map((o) => o.record.email), ['a@acme.com', 'logo@2x.png', 'c@gmail.com', 'info@acme.com']);
    assert.equal(new Set(charged.map((o) => o.record.email.toLowerCase())).size, charged.length);
});

test('an empty batch, blank lines and non-text values produce nothing and charge nothing', async () => {
    const { cleaner, calls } = makeCleaner();
    assert.deepEqual(await cleaner.process([]), []);
    assert.deepEqual(await cleaner.process(['', ' ', '\t', 5, {}, null, undefined]), []);
    assert.deepEqual([cleaner.counters.charged, cleaner.counters.blank, cleaner.counters.rejected, calls.length], [0, 3, 4, 0]);
});

test('lookups run in parallel up to the limit and never above it', async () => {
    let inFlight = 0;
    let peak = 0;
    const cleaner = createCleaner({
        concurrency: 4, disposableSet: DISP,
        lookup: async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; return MX('mx.example'); },
    });
    const out = await cleaner.process(Array.from({ length: 40 }, (_, i) => `u${i}@d${i}.com`));
    assert.equal(out.length, 40);
    assert.ok(peak > 1 && peak <= 4, `peak ${peak}`);
});

test('control: without the dedupe rule a repeat WOULD be charged twice (the test can fail)', async () => {
    const { cleaner } = makeCleaner({ dedupe: false });
    const out = await cleaner.process(['x@acme.com', 'x@acme.com']);
    assert.equal(out.filter((o) => o.charged).length, 1);
    assert.equal(out.length, 2);
});

import { newReturned, tallyReturned } from '../src/clean.js';

test('returned counts: a charged push that is written short (the maximum charge was reached) counts only the rows that were written', () => {
    const row = (status, reasons = []) => ({ status, reasons });
    const r = newReturned();
    const rows = [row('valid'), row('risky'), row('invalid'), row('valid'), row('valid')];
    assert.equal(tallyReturned(r, rows, true, 3), 3);
    assert.deepEqual([r.rows, r.charged, r.valid, r.risky, r.invalid], [3, 3, 1, 1, 1]);
    assert.equal(tallyReturned(r, [row('unknown'), row('invalid', ['not_an_email'])], false, undefined), 2);
    assert.deepEqual([r.rows, r.charged, r.unknown, r.not_an_email, r.invalid], [5, 3, 1, 1, 2]);
    assert.equal(tallyReturned(newReturned(), rows, true, undefined), 5, 'no written count: every row counts');
});

import { readFileSync } from 'node:fs';

test('the 1,000-line mixed fixture (the list used on the platform) gives the counts the platform run returned: 880 unique, 850 charged', async () => {
    const lines = JSON.parse(readFileSync(new URL('./fixtures/mixed-1000.json', import.meta.url), 'utf8'));
    const mx = MX('mx.example-host.net');
    const dns = { 'hotmial.com': { kind: 'a_fallback' }, 'yaho.com': { kind: 'a_fallback' }, 'outlok.com': { kind: 'a_fallback' }, 'gmail.con': { kind: 'nxdomain' }, 'yahooo.com': { kind: 'null_mx' }, 'yhoo.com': { kind: 'null_mx' }, 'gmail.co': { kind: 'null_mx' } };
    const disposable = new Set(['mailinator.com', 'guerrillamail.com', 'yopmail.com', 'sharklasers.com', 'trashmail.com']);
    const cleaner = createCleaner({ lookup: async (d) => dns[d] ?? (d.includes('no-such-domain') ? { kind: 'nxdomain' } : mx), disposableSet: disposable });
    const out = await cleaner.process(lines);
    const c = cleaner.counters;
    assert.deepEqual([lines.length, c.lines, c.blank, c.unique, c.duplicates, c.not_an_email, c.charged], [1000, 980, 20, 880, 100, 30, 850]);
    assert.equal(out.length, 880);
    assert.equal(out.filter((o) => o.charged).length, 850);
    assert.equal(new Set(out.filter((o) => o.charged).map((o) => o.record.email.toLowerCase())).size, 850, 'no address is charged twice');
});
