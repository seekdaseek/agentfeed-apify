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
const doge = read('./fixtures/hl-whales-doge-nobands.json');

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

// The Console Output tab shows each field's title and description, so none may be missing, at any depth.
function propertyNodes(node, path = []) {
    const out = [];
    for (const [key, value] of Object.entries(node.properties ?? {})) {
        out.push([[...path, key].join('.'), value]);
        out.push(...propertyNodes(value, [...path, key]));
        if (value.items) out.push(...propertyNodes(value.items, [...path, `${key}[]`]));
    }
    return out;
}

test('every field and every nested property has a title and a description', () => {
    const nodes = propertyNodes(dataset.fields);
    assert.ok(nodes.length >= 38, `expected the full property tree, found ${nodes.length}`);
    const missing = nodes.flatMap(([name, node]) => ['title', 'description'].filter((k) => typeof node[k] !== 'string' || node[k].trim() === '').map((k) => `${name}: ${k}`));
    assert.deepEqual(missing, []);
});

test('the four fields the Output tab showed bare carry their agreed descriptions', () => {
    const f = dataset.fields.properties;
    assert.equal(f.mark_price.description, 'Hyperliquid mark price in USD when the positions were read.');
    assert.equal(f.long.description, "Totals for the tracked accounts' long positions: accounts, notional USD, size-weighted entry, notional-weighted distance to liquidation, USD within 10% of liquidation, unrealized PnL.");
    assert.equal(f.short.description, f.long.description.replace('long positions', 'short positions'));
    assert.equal(f.source.description, 'Where the data comes from.');
});

test('control: the description check can fail (a node without one is reported)', () => {
    const broken = { properties: { a: { title: 'A', description: 'x', properties: { b: { title: 'B' } } } } };
    const missing = propertyNodes(broken).filter(([, n]) => typeof n.description !== 'string').map(([name]) => name);
    assert.deepEqual(missing, ['a.b']);
});

test('control: an item missing a required field fails the schema (the check can fail)', () => {
    const item = mapCoin('BTC', live);
    delete item.source;
    assert.equal(validate(item), false);
});

test('every key the mapper emits is described in the schema (drift guard); `note` is the one optional field, present only without bands', () => {
    const item = mapCoin('BTC', live);
    const props = dataset.fields.properties;
    assert.deepEqual(Object.keys(item).sort(), Object.keys(props).filter((k) => k !== 'note').sort());
    assert.deepEqual(Object.keys(mapCoin('DOGE', doge)).sort(), Object.keys(props).sort());
    assert.ok(!dataset.fields.required.includes('note'));
    assert.deepEqual(Object.keys(item.long).sort(), Object.keys(props.long.properties).sort());
    assert.deepEqual(Object.keys(item.short).sort(), Object.keys(props.short.properties).sort());
    assert.deepEqual(Object.keys(item.liquidation_bands[0]).sort(), Object.keys(props.liquidation_bands.items.properties).sort());
    assert.deepEqual(Object.keys(item.largest_positions[0]).sort(), Object.keys(props.largest_positions.items.properties).sort());
});

test('an item without bands (real DOGE response, with its note) validates against the schema', () => {
    check(mapCoin('DOGE', doge, '2026-10-15T06:30:00.000Z'));
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

// The Console Output tab shows the schema title of a nested field, so long.* and short.* must not share a title: a buyer reading
// "Notional (USD)" twice cannot tell the long total from the short one. These are the two pairs the Overview view shows.
const SIDE_PAIRS = [
    ['notional_usd', 'notional (USD)'],
    ['within_10pct_of_liq_usd', 'USD within 10% of liquidation'],
];

test('long and short totals carry their side in the title, and the Overview labels say the same', () => {
    const props = dataset.fields.properties;
    const labels = dataset.views.overview.display.properties;
    for (const [key, rest] of SIDE_PAIRS) {
        assert.equal(props.long.properties[key].title, `Long ${rest}`);
        assert.equal(props.short.properties[key].title, `Short ${rest}`);
        assert.equal(labels[`long.${key}`].label, props.long.properties[key].title);
        assert.equal(labels[`short.${key}`].label, props.short.properties[key].title);
    }
});

const duplicates = (labels) => labels.filter((l, i) => labels.indexOf(l) !== i);

test('no two columns of a view share a label', () => {
    for (const [id, view] of Object.entries(dataset.views)) {
        assert.deepEqual(duplicates(Object.values(view.display.properties).map((p) => p.label)), [], `${id}: duplicate labels`);
    }
});

test('control: the duplicate-label check can fail (two columns with one label are reported)', () => {
    assert.deepEqual(duplicates(['Notional (USD)', 'Mark price', 'Notional (USD)']), ['Notional (USD)']);
});

test('output schema links only to views that exist', () => {
    for (const [id, prop] of Object.entries(output.properties)) {
        const m = /\?view=([a-z_]+)$/.exec(prop.template);
        assert.ok(m, `${id}: template has no view`);
        assert.ok(dataset.views[m[1]], `${id}: view ${m[1]} is not defined`);
        assert.ok(prop.template.startsWith('{{links.apiDefaultDatasetUrl}}/items'));
    }
});
