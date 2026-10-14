// Schema checks every actor runs against its own .actor files (registered from the actor's test/schema.test.js).
// Not copied into an actor: tests import it from here. Apify validates every push against the dataset schema's `fields`
// (AJV, JSON Schema draft-07) and discards the whole push on a mismatch, and the Console shows each field's title and
// description, so both must be complete at every depth.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readJson = (dir, rel) => JSON.parse(fs.readFileSync(new URL(rel, dir), 'utf8'));

export function propertyNodes(node, path = []) {
    const out = [];
    for (const [key, value] of Object.entries(node.properties ?? {})) {
        out.push([[...path, key].join('.'), value]);
        out.push(...propertyNodes(value, [...path, key]));
        if (value.items) out.push(...propertyNodes(value.items, [...path, `${key}[]`]));
    }
    return out;
}

// What Apify does with a view (measured live, 14 Oct 2026): `fields` is applied first, then `unwind` merges each array element's
// keys into its row, and `flatten` runs BEFORE `unwind`. The columns a view produces are computed in that order.
export function viewColumns(view, props) {
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
        } else cols.push(col);
    }
    return cols;
}

/**
 * actorDir: URL of the actor folder (new URL('..', import.meta.url) from its test/ folder).
 * Ajv: the actor's own ajv import. items: real mapped items (all must validate). nullItem: an item the mapper produced from
 * junk fields. expectedViews: view ids the output schema must link. minProperties: size of the property tree.
 */
export function schemaChecks({ actorDir, Ajv, items, nullItem, expectedViews = ['overview'], minProperties = 8 }) {
    const dataset = readJson(actorDir, '.actor/dataset_schema.json');
    const output = readJson(actorDir, '.actor/output_schema.json');
    const actor = readJson(actorDir, '.actor/actor.json');
    const input = readJson(actorDir, '.actor/input_schema.json');
    const validate = new Ajv({ strict: false, allErrors: true }).compile(dataset.fields);
    const check = (item) => assert.ok(validate(item), JSON.stringify(validate.errors));

    test('schema is wired into actor.json the way the Apify docs say, with 256 MB and a secret key', () => {
        assert.equal(actor.storages.dataset, './dataset_schema.json');
        assert.equal(actor.output, './output_schema.json');
        assert.equal(actor.input, './input_schema.json');
        assert.equal(actor.defaultMemoryMbytes, 256);
        assert.match(actor.environmentVariables.AGENTFEED_KEY, /^@[a-zA-Z]+Key$/);
        assert.ok(!('$schema' in dataset.fields) || dataset.fields.$schema === 'http://json-schema.org/draft-07/schema#');
    });

    test('every real mapped item validates against the dataset schema', () => {
        assert.ok(items.length > 0);
        for (const item of items) check(item);
    });

    test('an item built from junk fields (nulls everywhere the mapper can null) still validates', () => check(nullItem));

    test('control: an item missing a required field fails the schema (the check can fail)', () => {
        const broken = { ...items[0] };
        delete broken[dataset.fields.required[0]];
        assert.equal(validate(broken), false);
    });

    test('every key the mapper emits is described in the schema (drift guard)', () => {
        assert.deepEqual(Object.keys(items[0]).sort(), Object.keys(dataset.fields.properties).sort());
    });

    test('every field and every nested property has a title and a description', () => {
        const nodes = propertyNodes(dataset.fields);
        assert.ok(nodes.length >= minProperties, `expected the full property tree, found ${nodes.length}`);
        const missing = nodes.flatMap(([name, node]) => ['title', 'description'].filter((k) => typeof node[k] !== 'string' || node[k].trim() === '').map((k) => `${name}: ${k}`));
        assert.deepEqual(missing, []);
    });

    test('control: the description check can fail (a node without one is reported)', () => {
        const broken = { properties: { a: { title: 'A', description: 'x', properties: { b: { title: 'B' } } } } };
        assert.deepEqual(propertyNodes(broken).filter(([, n]) => typeof n.description !== 'string').map(([name]) => name), ['a.b']);
    });

    test('the input schema has a title and a description on every property, and every list input has a non-empty prefill', () => {
        for (const [name, p] of Object.entries(input.properties)) {
            assert.ok(p.title && p.description, `${name}: title and description`);
            if (p.type === 'array') assert.ok(Array.isArray(p.prefill) && p.prefill.length > 0, `${name}: list input needs a non-empty prefill`);
            if (p.type === 'integer') assert.ok(p.minimum !== undefined || p.maximum !== undefined || p.default !== undefined, `${name}: integer input needs bounds or a default`);
        }
    });

    test('view columns resolve and display describes exactly the columns each view produces', () => {
        for (const [id, view] of Object.entries(dataset.views)) {
            assert.deepEqual(Object.keys(view.display.properties).sort(), viewColumns(view, dataset.fields.properties).sort(), `${id}: display and produced columns disagree`);
        }
    });

    test('control: a view that unwinds and flattens the same array is rejected by the column check', () => {
        const broken = { transformation: { unwind: ['x'], flatten: ['x'], fields: ['x.y'] }, display: { properties: {} } };
        assert.throws(() => viewColumns(broken, { x: { type: 'array', items: { properties: { y: {} } } } }), /must not also be flattened/);
    });

    test('the output schema links exactly the views the dataset schema defines', () => {
        const linked = Object.values(output.properties).map((p) => {
            const m = /^\{\{links\.apiDefaultDatasetUrl\}\}\/items\?view=([a-z_]+)$/.exec(p.template);
            assert.ok(m, `bad template ${p.template}`);
            assert.ok(dataset.views[m[1]], `view ${m[1]} is not defined`);
            return m[1];
        });
        assert.deepEqual(linked.sort(), [...expectedViews].sort());
    });
}
