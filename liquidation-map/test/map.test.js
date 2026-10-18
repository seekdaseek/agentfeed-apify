import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collect, getAgentFeed } from '../src/agentfeed.js';
import { COIN_PATTERN, NO_BANDS_NOTE, SOURCE, mapCoin } from '../src/map.js';

const live = JSON.parse(fs.readFileSync(new URL('./fixtures/hl-whales-btc.json', import.meta.url), 'utf8'));
const doge = JSON.parse(fs.readFileSync(new URL('./fixtures/hl-whales-doge-nobands.json', import.meta.url), 'utf8'));
const quiet = { info() {}, warning() {}, error() {} };

test('mapCoin: a real /api/hl-whales?coin=BTC response becomes the documented item', () => {
    const item = mapCoin('BTC', live, '2026-10-14T12:20:00.000Z');
    const d = live.data;
    assert.equal(item.coin, 'BTC');
    assert.equal(item.mark_price, d.mark_px);
    assert.equal(item.as_of, d.as_of);
    assert.equal(item.fetched_at, '2026-10-14T12:20:00.000Z');
    assert.equal(item.net_usd, d.net_usd);
    assert.equal(item.long.notional_usd, d.long.notional_usd);
    assert.equal(item.short.accounts, d.short.accounts);
    assert.equal(item.liquidation_bands.length, d.liquidation_clusters.length);
    assert.deepEqual(item.liquidation_bands[0], { price_from: d.liquidation_clusters[0].from_px, price_to: d.liquidation_clusters[0].to_px, long_usd_at_risk: d.liquidation_clusters[0].longs_liq_usd, short_usd_at_risk: d.liquidation_clusters[0].shorts_liq_usd });
    assert.equal(item.largest_positions.length, d.top_positions.length);
    assert.equal(item.largest_positions[0].address, d.top_positions[0].address);
    assert.equal(item.largest_positions[0].liquidation_px, d.top_positions[0].liquidation_px);
    assert.equal(item.accounts_scanned, d.accounts_scanned);
    assert.equal(item.source, SOURCE);
    assert.equal(SOURCE, 'AgentFeed, Hyperliquid on-chain positions');
});

test('mapCoin: bands are 5% of the mark price wide, as the README says', () => {
    const item = mapCoin('BTC', live);
    for (const b of item.liquidation_bands) assert.ok(Math.abs((b.price_to - b.price_from) / item.mark_price - 0.05) < 0.002, JSON.stringify(b));
});

test('mapCoin: nothing to sell (no data, or no bands and no positions) is null', () => {
    assert.equal(mapCoin('X', {}), null);
    assert.equal(mapCoin('X', { data: { coin: 'X', liquidation_clusters: [], top_positions: [] } }), null);
    assert.equal(mapCoin('X', null), null);
});

test('mapCoin: a non-numeric field becomes null instead of leaking a string into a number column', () => {
    const item = mapCoin('BTC', { data: { ...live.data, mark_px: '83695', net_usd: NaN } });
    assert.equal(item.mark_price, null);
    assert.equal(item.net_usd, null);
});

test('COIN_PATTERN accepts BTC, 1000PEPE-style names and refuses path tricks', () => {
    for (const ok of ['BTC', 'SOL', 'HYPE', '1000PEPE']) assert.match(ok, COIN_PATTERN);
    for (const bad of ['', 'BTC&top=50', '../x', 'a b', 'A'.repeat(16)]) assert.doesNotMatch(bad, COIN_PATTERN);
});

// The brief's test: upstream failure = no item, no charge. Charging happens inside push(), so "no push" is "no charge".
test('end to end with the real client and mapper: BTC ok, NOPE 400, ETH 500 => exactly one push', async () => {
    const calls = [];
    const fetchFn = async (url) => {
        const coin = new URL(url).searchParams.get('coin');
        calls.push(coin);
        if (coin === 'NOPE') return new Response(JSON.stringify({ error: 'unknown Hyperliquid perp NOPE' }), { status: 400 });
        if (coin === 'ETH') return new Response('upstream down', { status: 500 });
        return new Response(JSON.stringify(live), { status: 200 });
    };
    const pushed = [];
    const stats = await collect({
        names: ['BTC', 'NOPE', 'ETH'],
        request: (coin) => getAgentFeed('/api/hl-whales', { coin }, { key: 'afk_x', fetchFn }),
        toItem: (coin, body) => mapCoin(coin, body),
        push: async (item) => { pushed.push(item.coin); },
        log: quiet,
    });
    assert.deepEqual(calls, ['BTC', 'NOPE', 'ETH']);
    assert.deepEqual(pushed, ['BTC']);
    assert.equal(stats.failed, 2);
});

// Measured live 15 Oct 2026: the tracked accounts hold DOGE, SUI and BNB far from liquidation (or well collateralised), so the route
// returns positions but `liquidation_clusters: []`. The item is still returned, with a note, and is never charged (push.js).
test('mapCoin: a real coin with positions but no bands (DOGE) is an item that carries the agreed note', () => {
    assert.equal(doge.data.liquidation_clusters.length, 0);
    assert.ok(doge.data.top_positions.length > 0);
    const item = mapCoin('DOGE', doge, '2026-10-15T06:30:00.000Z');
    assert.ok(item);
    assert.deepEqual(item.liquidation_bands, []);
    assert.equal(item.largest_positions.length, doge.data.top_positions.length);
    assert.equal(item.note, 'No tracked position has a liquidation price within 50% of the mark, so this coin has no heatmap bands right now. This item was not charged.');
    assert.equal(NO_BANDS_NOTE, item.note);
});

test('mapCoin: a normal item has no note key at all, so its output is exactly what it was', () => {
    assert.equal(Object.hasOwn(mapCoin('BTC', live), 'note'), false);
});
