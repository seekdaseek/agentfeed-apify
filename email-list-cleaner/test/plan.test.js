import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_NAME, SAMPLE_EMAILS, planInput, splitMany, valuesAt } from '../src/plan.js';

test('the event name is a noun key; the Store title for it is set in the Console as "Checked email"', () => {
    assert.equal(EVENT_NAME, 'checked-email');
});

test('nothing asked: the sample list runs, so the default run always returns data', () => {
    for (const input of [{}, { emails: [] }, { emails: null, datasetId: '' }, { emails: '' }]) {
        const p = planInput(input);
        assert.equal(p.mode, 'sample');
        assert.deepEqual(p.emails, SAMPLE_EMAILS);
        assert.equal(p.dedupe, true);
        assert.equal(p.error, undefined);
    }
});

test('a list, newline text and a dataset are each their own mode; the field defaults to email; dedupe is on unless switched off', () => {
    assert.deepEqual([planInput({ emails: ['a@x.com'] }).mode, planInput({ emails: 'a@x.com\nb@x.com' }).emails], ['emails', ['a@x.com', 'b@x.com']]);
    const d = planInput({ datasetId: 'AbC123xyz456QwErT', field: 'contact.email', dedupe: false });
    assert.deepEqual([d.mode, d.datasetId, d.field, d.dedupe, d.emails], ['dataset', 'AbC123xyz456QwErT', 'contact.email', false, []]);
    assert.equal(planInput({ datasetId: 'AbC123xyz456QwErT' }).field, 'email');
    assert.equal(planInput({ emails: ['a@x.com'], datasetId: 'user~my-scrape' }).mode, 'both');
    assert.equal(planInput({ emails: ['a@x.com'], dedupe: null }).dedupe, true);
});

test('what the caller gave is never replaced by the sample: a bad dataset id, field or emails value is an error that stops the run before any lookup', () => {
    assert.match(planInput({ datasetId: 'bad id with spaces' }).error, /not a dataset id/);
    assert.match(planInput({ datasetId: 123 }).error, /datasetId must be text/);
    assert.match(planInput({ datasetId: 'abc', field: 7 }).error, /field must be/);
    assert.match(planInput({ datasetId: 'abc', field: 'bad field!' }).error, /field must be/);
    assert.match(planInput({ emails: 42 }).error, /emails must be/);
    assert.match(planInput({ emails: { a: 1 } }).error, /emails must be/);
    for (const bad of [{ datasetId: 'bad id' }, { emails: 42 }]) assert.equal(planInput(bad).mode, undefined);
});

test('splitMany splits on newlines, commas and semicolons and drops blanks', () => {
    assert.deepEqual(splitMany('a@x.com, b@x.com;c@x.com\r\n\nd@x.com'), ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']);
    assert.deepEqual(splitMany('  '), []);
});

test('valuesAt reads a plain field, a dotted path, a list and nested lists; anything that is not text is dropped', () => {
    assert.deepEqual(valuesAt({ email: 'a@x.com' }, 'email'), ['a@x.com']);
    assert.deepEqual(valuesAt({ contact: { email: 'a@x.com; b@x.com' } }, 'contact.email'), ['a@x.com', 'b@x.com']);
    assert.deepEqual(valuesAt({ emails: ['a@x.com', ['b@x.com', 5, null], { x: 1 }] }, 'emails'), ['a@x.com', 'b@x.com']);
    assert.deepEqual(valuesAt({ email: 5 }, 'email'), []);
    assert.deepEqual(valuesAt({ a: 'x' }, 'missing'), []);
    assert.deepEqual(valuesAt({ a: 'x' }, 'a.b.c'), []);
    assert.deepEqual(valuesAt(null, 'a'), []);
});

test('the sample list shows every class the actor knows: a fix, a typo, junk, a placeholder, disposable, a role, a dead domain and a repeat', () => {
    const joined = SAMPLE_EMAILS.join('\n');
    for (const piece of ['mailto:', 'gmai.com', '@2x.png', 'sentry.wixpress.com', '@example.com', 'mailinator.com', 'info@', 'does-not-exist']) assert.ok(joined.includes(piece), piece);
    assert.equal(SAMPLE_EMAILS.filter((e) => e.toLowerCase().includes('jane.doe@gmail.com')).length, 2);
});

test('the emails input has a prefill but NO default: the platform adds a default to every run, so a dataset-only run would also check the sample', async () => {
    const { readFileSync } = await import('node:fs');
    const schema = JSON.parse(readFileSync(new URL('../.actor/input_schema.json', import.meta.url), 'utf8'));
    assert.ok(!('default' in schema.properties.emails));
    assert.deepEqual(schema.properties.emails.prefill, SAMPLE_EMAILS);
    assert.equal(schema.properties.datasetId.editor, 'resourcePicker');
    assert.equal(schema.properties.datasetId.resourceType, 'dataset');
    assert.deepEqual(schema.properties.datasetId.resourcePermissions, ['READ']);
    assert.equal(planInput({ datasetId: 'AbC123xyz456QwErT', field: 'email' }).mode, 'dataset');
});
