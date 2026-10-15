import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectMany } from '../src/multi.js';
import { getAgentFeed } from '../src/agentfeed.js';
import { AGENCY, DEFAULT_DAYS, EVENT_NAME, MAX_DAYS, TYPES, mapCalendar, planInput } from '../src/map.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const T = '2026-10-15T10:30:00.000Z';
const KEY = 'afk_TESTKEYTESTKEYTESTKEYTESTKEYTESTKEYTESTKEY00';
const quiet = () => { const lines = []; return { lines, info: (m) => lines.push(['info', m]), warning: (m) => lines.push(['warning', m]), error: (m) => lines.push(['error', m]) }; };
const reply = (status, body) => new Response(JSON.stringify(body), { status });

test('the event name is a noun key; the Store title for it is set in the Console as "Economic release"', () => {
    assert.equal(EVENT_NAME, 'release');
});

test('planInput: no input means all four releases and 90 days (the default run always has rows)', () => {
    for (const input of [{}, { types: [] }, { types: null, days: null }]) assert.deepEqual(planInput(input), { types: TYPES, days: DEFAULT_DAYS, warnings: [] });
});

test('planInput: chosen types are upper-cased, de-duplicated and kept in the order given; days must be a whole number from 1 to 365', () => {
    assert.deepEqual(planInput({ types: ['cpi', ' FOMC ', 'CPI'], days: 30 }), { types: ['CPI', 'FOMC'], days: 30, warnings: [] });
    assert.equal(planInput({ days: 1 }).days, 1);
    assert.equal(planInput({ days: MAX_DAYS }).days, 365);
    for (const bad of [0, -3, 366, 1.5, '30', NaN]) assert.match(planInput({ days: bad }).error, /whole number from 1 to 365/, String(bad));
});

test('planInput: an unknown name is a warning; only unknown names is an error (the run fails before any request, so nothing is charged)', () => {
    const some = planInput({ types: ['FOMC', 'GDP'] });
    assert.deepEqual(some.types, ['FOMC']);
    assert.equal(some.warnings.length, 1);
    assert.match(planInput({ types: ['GDP', ''] }).error, /None of the releases you chose exists/);
});

test('mapCalendar: the real 90-day answer becomes 9 rows with the agency, UTC time, days until and the next flag', () => {
    const items = mapCalendar(TYPES, fx('calendar-90-days.json'), T);
    assert.equal(items.length, 9);
    assert.deepEqual(items.map((i) => `${i.type} ${i.date}`), ['FOMC 2026-10-28', 'PCE 2026-11-04', 'NFP 2026-11-06', 'CPI 2026-11-10', 'PCE 2026-12-02', 'NFP 2026-12-04', 'FOMC 2026-12-09', 'CPI 2026-12-10', 'NFP 2027-01-08']);
    const fomc = items[0];
    assert.equal(fomc.agency, 'Federal Reserve');
    assert.equal(fomc.time_new_york, '14:00');
    assert.equal(fomc.utc, '2026-10-28T18:00:00.000Z');
    assert.equal(fomc.press_conference, true);
    assert.equal(fomc.reference_period, null);
    assert.equal(fomc.days_until, 13);
    assert.equal(fomc.is_next, true);
    assert.equal(items[1].press_conference, null);
    assert.equal(items.filter((i) => i.is_next).length, 4);
    assert.deepEqual(items.filter((i) => i.is_next).map((i) => i.type).sort(), ['CPI', 'FOMC', 'NFP', 'PCE']);
    assert.ok(items.every((i) => i.agency === AGENCY[i.type] && i.fetched_at === T && /^https:\/\//.test(i.source_url)));
});

test('mapCalendar: the chosen types are filtered here, and a type with no row in the window gives nothing', () => {
    assert.deepEqual(mapCalendar(['CPI'], fx('calendar-90-days.json'), T).map((i) => i.date), ['2026-11-10', '2026-12-10']);
    assert.deepEqual(mapCalendar(['FOMC', 'NFP'], fx('calendar-14-days.json'), T).map((i) => i.type), ['FOMC']);
    assert.deepEqual(mapCalendar(['CPI'], fx('calendar-14-days.json'), T), []);
});

test('mapCalendar: the real answer with no events (an unknown type asked of the source) is not an item', () => {
    assert.deepEqual(mapCalendar(TYPES, fx('calendar-unknown-type-empty.json'), T), []);
});

test('mapCalendar: a missing or malformed body, and rows without a type, date or UTC time, are dropped', () => {
    for (const body of [null, undefined, {}, { data: null }, { data: {} }, { data: { events: 'x' } }, { error: 'x' }]) assert.deepEqual(mapCalendar(TYPES, body, T), [], JSON.stringify(body));
    const good = { type: 'CPI', title: 'Consumer Price Index', date_new_york: '2026-11-10', time_new_york: '08:30', utc: '2026-11-10T13:30:00.000Z', source_url: 'https://www.bls.gov/x', verified_at: T };
    const rows = [{ ...good, type: 'GDP' }, { ...good, date_new_york: '' }, { ...good, utc: 'not a time' }, { ...good, utc: undefined }, null, 'x', good];
    assert.equal(mapCalendar(TYPES, { data: { events: rows, next: {} } }, T).length, 1);
});

test('mapCalendar: a row whose title is missing falls back to its type, and an unparseable fetch time gives null days_until', () => {
    const e = { type: 'NFP', date_new_york: '2026-11-06', utc: '2026-11-06T13:30:00.000Z' };
    const [a] = mapCalendar(['NFP'], { data: { events: [e] } }, T);
    assert.equal(a.title, 'NFP');
    assert.equal(a.is_next, false);
    const [b] = mapCalendar(['NFP'], { data: { events: [e] } }, 'garbage');
    assert.equal(b.days_until, null);
});

test('end to end: one request lists the rows; the request carries days (not the key), and each row is one charged item', async () => {
    let seen;
    const plan = planInput({ types: ['CPI', 'NFP'], days: 90 });
    const pushed = [];
    const stats = await collectMany({
        jobs: [{ name: 'US macro calendar' }],
        request: () => getAgentFeed('/api/macro-calendar', { days: plan.days }, { key: KEY, fetchFn: async (url, init) => { seen = { url: new URL(url), headers: init.headers }; return reply(200, fx('calendar-90-days.json')); } }),
        toItems: (job, body) => mapCalendar(plan.types, body, T),
        push: async (items) => { pushed.push(...items); },
        log: quiet(),
    });
    assert.equal(seen.url.pathname, '/api/macro-calendar');
    assert.equal(seen.url.searchParams.get('days'), '90');
    assert.equal(seen.url.searchParams.get('type'), null);
    assert.equal(seen.headers['X-AgentFeed-Key'], KEY);
    assert.ok(!String(seen.url).includes(KEY));
    assert.equal(stats.pushed, 5);
    assert.deepEqual(pushed.map((i) => i.type), ['NFP', 'CPI', 'NFP', 'CPI', 'NFP']);
});

test('end to end: a 503 (schedule not verified), a window with none of the chosen types and a rejected key charge nothing', async () => {
    const run = async (status, body, types = TYPES) => {
        const pushed = [];
        const stats = await collectMany({
            jobs: [{ name: 'cal' }],
            request: () => getAgentFeed('/api/macro-calendar', { days: 14 }, { key: KEY, fetchFn: async () => reply(status, body) }),
            toItems: (job, b) => mapCalendar(types, b, T),
            push: async (items) => { pushed.push(...items); },
            log: quiet(),
        });
        return { pushed, stats };
    };
    const stale = await run(503, { error: 'calendar data verified more than 35 days ago' });
    assert.deepEqual(stale.pushed, []);
    assert.equal(stale.stats.failed, 1);
    const none = await run(200, fx('calendar-14-days.json'), ['CPI']);
    assert.deepEqual(none.pushed, []);
    assert.equal(none.stats.empty, 1);
    const denied = await run(402, { error: 'balance too low' });
    assert.deepEqual(denied.pushed, []);
    assert.equal(denied.stats.authFailed, true);
});

test('control: the empty-output rule can fail (one chosen type that is in the window IS an item)', () => {
    assert.equal(mapCalendar(['FOMC'], fx('calendar-14-days.json'), T).length, 1);
});
