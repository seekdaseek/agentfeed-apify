import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collect, getAgentFeed } from '../src/agentfeed.js';
import { mapCoin } from '../src/map.js';
import { pushItem } from '../src/push.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const btc = fx('hl-whales-btc.json');
const doge = fx('hl-whales-doge-nobands.json');
const T = '2026-10-15T06:30:00.000Z';
const quiet = { info() {}, warning() {}, error() {} };

function spies(chargeResult) {
    const calls = { charged: [], free: [] };
    return { calls, deps: { pushCharged: async (i) => { calls.charged.push(i.coin); return chargeResult; }, pushFree: async (i) => { calls.free.push(i.coin); } } };
}

test('an item without bands is pushed free: the free path runs once, the charged path never', async () => {
    const { calls, deps } = spies({ eventChargeLimitReached: false, chargedCount: 1 });
    const out = await pushItem(mapCoin('DOGE', doge, T), deps);
    assert.deepEqual(calls, { charged: [], free: ['DOGE'] });
    assert.equal(out, undefined, 'a free push reports no charge result');
});

test('a normal item is charged exactly once: the charged path runs once, the free path never', async () => {
    const { calls, deps } = spies({ eventChargeLimitReached: false, chargedCount: 1 });
    const out = await pushItem(mapCoin('BTC', btc, T), deps);
    assert.deepEqual(calls, { charged: ['BTC'], free: [] });
    assert.deepEqual(out, { eventChargeLimitReached: false, chargedCount: 1 });
});

test('control: an item whose bands are missing or not an array is never charged', async () => {
    for (const odd of [{ coin: 'X' }, { coin: 'X', liquidation_bands: null }, { coin: 'X', liquidation_bands: [] }]) {
        const { calls, deps } = spies({});
        await pushItem(odd, deps);
        assert.deepEqual(calls.charged, [], JSON.stringify(odd));
        assert.deepEqual(calls.free, ['X']);
    }
});

// The brief's two tests, end to end through the real client, mapper and loop: BTC (bands), DOGE (positions, no bands), NOPE (400).
test('end to end: BTC is charged once, DOGE is returned free, NOPE returns nothing', async () => {
    const fetchFn = async (url) => {
        const coin = new URL(url).searchParams.get('coin');
        if (coin === 'NOPE') return new Response(JSON.stringify({ error: 'unknown Hyperliquid perp NOPE' }), { status: 400 });
        return new Response(JSON.stringify(coin === 'DOGE' ? doge : btc), { status: 200 });
    };
    const { calls, deps } = spies({ eventChargeLimitReached: false, chargedCount: 1 });
    const stats = await collect({
        names: ['BTC', 'DOGE', 'NOPE'],
        request: (coin) => getAgentFeed('/api/hl-whales', { coin }, { key: 'afk_x', fetchFn }),
        toItem: (coin, body) => mapCoin(coin, body, T),
        push: (item) => pushItem(item, deps),
        log: quiet,
    });
    assert.deepEqual(calls.charged, ['BTC']);
    assert.deepEqual(calls.free, ['DOGE']);
    assert.equal(stats.pushed, 2);
    assert.equal(stats.failed, 1);
});

test('a charged item that hits the spending cap still stops the run; a free item never does', async () => {
    const make = (cap) => async (url) => new Response(JSON.stringify(new URL(url).searchParams.get('coin') === 'DOGE' ? doge : btc), { status: 200 });
    const requested = [];
    const run = async (names, chargeResult) => {
        requested.length = 0;
        const { deps } = spies(chargeResult);
        const fetchFn = make();
        return collect({ names, request: (coin) => { requested.push(coin); return getAgentFeed('/api/hl-whales', { coin }, { key: 'afk_x', fetchFn }); }, toItem: (coin, body) => mapCoin(coin, body, T), push: (item) => pushItem(item, deps), log: quiet });
    };
    const capped = await run(['BTC', 'ETH'], { eventChargeLimitReached: true, chargedCount: 1 });
    assert.equal(capped.limitReached, true);
    assert.deepEqual(requested, ['BTC']);
    const freeOnly = await run(['DOGE', 'BTC'], { eventChargeLimitReached: false, chargedCount: 1 });
    assert.equal(freeOnly.limitReached, false);
    assert.deepEqual(requested, ['DOGE', 'BTC']);
});
