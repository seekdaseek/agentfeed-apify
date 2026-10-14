import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv from 'ajv';
import { mapCoin } from '../src/map.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const dataset = read('../.actor/dataset_schema.json');
const output = read('../.actor/output_schema.json');
const actor = read('../.actor/actor.json');
const live = read('./fixtures/hl-whales-btc.json');

// Apify validates every push against `fields` with AJV (JSON Schema draft-07) and discards the whole request on a mismatch,
// so the schema must accept every item the mapper can produce. strict:false because `example` is an Apify extension keyword.
const validate = new Ajv({ strict: false, allErrors: true }).compile(dataset.fields);
const check = (item) => { assert.ok(validate(item), JSON.stringify(validate.errors)); };

test('schema is wired into actor.json the way the Apify docs say', () => {
    assert.equal(actor.storages.dataset, './dataset_schema.json');
    assert.equal(actor.output, './output_schema.json');
    assert.ok(!('$schema' in dataset.fields) || dataset.fields.$schema === 'http://json-schema.org/draft-07/schema#');
});

test('a real mapped item validates, and so does the committed example', () => {
    check(mapCoin('BTC', live, '2026-10-14T12:20:00.000Z'));
    check(read('../examples/BTC.json'));
});

test('an item full of nulls (every non-numeric upstream field) still validates', () => {
    const body = { data: { ...live.data, mark_px: 'x', net_usd: NaN, long: { accounts: 'x' }, short: null, as_of: undefined, accounts_scanned: null } };
    const item = mapCoin('BTC', body, '2026-10-14T12:20:00.000Z');
    assert.equal(item.mark_price, null);
    check(item);
});

test('a coin with bands but no positions, and one with positions but no bands, both validate', () => {
    check(mapCoin('X', { data: { coin: 'X', liquidation_clusters: live.data.liquidation_clusters, top_positions: [] } }));
    check(mapCoin('X', { data: { coin: 'X', liquidation_clusters: [], top_positions: live.data.top_positions } }));
});

test('control: an item missing a required field fails the schema (the check can fail)', () => {
    const item = mapCoin('BTC', live);
    delete item.source;
    assert.equal(validate(item), false);
});

test('every key the mapper emits is described in the schema (drift guard)', () => {
    const item = mapCoin('BTC', live);
    const props = dataset.fields.properties;
    assert.deepEqual(Object.keys(item).sort(), Object.keys(props).sort());
    assert.deepEqual(Object.keys(item.long).sort(), Object.keys(props.long.properties).sort());
    assert.deepEqual(Object.keys(item.short).sort(), Object.keys(props.short.properties).sort());
    assert.deepEqual(Object.keys(item.liquidation_bands[0]).sort(), Object.keys(props.liquidation_bands.items.properties).sort());
    assert.deepEqual(Object.keys(item.largest_positions[0]).sort(), Object.keys(props.largest_positions.items.properties).sort());
});

// What Apify does with a view (measured live on a real run, 14 Oct 2026): `fields` is applied first, then `unwind` merges each array
// element's keys into its own row, and `flatten` runs BEFORE `unwind` (so flattening an array that is also unwound leaves one row with
// only the first columns). The columns a view produces must therefore be computed in that order, and display must describe exactly them.
function viewColumns(view, props) {
    const flat = new Set(view.transformation.flatten ?? []);
    const unwind = new Set(view.transformation.unwind ?? []);
    for (const f of unwind) assert.ok(!flat.has(f), `an unwound array (${f}) must not also be flattened`);
    const cols = [];
    for (const col of view.transformation.fields) {
        const [head, sub] = col.split('.');
        assert.ok(props[head], `no field ${head}`);
        if (unwind.has(head)) {
            assert.equal(props[head].type, 'array', `${head} is unwound but is not an array`);
            cols.push(...Object.keys(props[head].items.properties));
        } else if (sub) {
            assert.ok(flat.has(head), `${col} is nested but ${head} is not flattened`);
            assert.ok(props[head].properties[sub], `${col} is not in the schema`);
            cols.push(col);
        } else {
            cols.push(col);
        }
    }
    return cols;
}

test('view columns resolve and display describes exactly the columns each view produces', () => {
    const props = dataset.fields.properties;
    for (const [id, view] of Object.entries(dataset.views)) {
        assert.deepEqual(Object.keys(view.display.properties).sort(), viewColumns(view, props).sort(), `${id}: display and produced columns disagree`);
    }
});

test('the bands view unwinds without flatten, keeps the array in fields, and yields the five columns the brief asked for', () => {
    const v = dataset.views.bands;
    assert.deepEqual(v.transformation, { unwind: ['liquidation_bands'], fields: ['coin', 'liquidation_bands'] });
    assert.deepEqual(Object.keys(v.display.properties), ['coin', 'price_from', 'price_to', 'long_usd_at_risk', 'short_usd_at_risk']);
});

test('control: the old broken bands view (unwind and flatten the same array) is rejected by the column check', () => {
    const broken = { transformation: { unwind: ['liquidation_bands'], flatten: ['liquidation_bands'], fields: ['coin', 'liquidation_bands.price_from'] }, display: { properties: {} } };
    assert.throws(() => viewColumns(broken, dataset.fields.properties), /must not also be flattened/);
});

test('the overview view has the columns the brief asked for', () => {
    assert.deepEqual(dataset.views.overview.transformation.fields, ['coin', 'mark_price', 'net_usd', 'long.notional_usd', 'short.notional_usd', 'long.within_10pct_of_liq_usd', 'short.within_10pct_of_liq_usd', 'accounts_with_positions', 'as_of']);
});

test('output schema links only to views that exist', () => {
    for (const [id, prop] of Object.entries(output.properties)) {
        const m = /\?view=([a-z_]+)$/.exec(prop.template);
        assert.ok(m, `${id}: template has no view`);
        assert.ok(dataset.views[m[1]], `${id}: view ${m[1]} is not defined`);
        assert.ok(prop.template.startsWith('{{links.apiDefaultDatasetUrl}}/items'));
    }
});
