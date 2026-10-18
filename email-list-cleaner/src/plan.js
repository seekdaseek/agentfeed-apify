// What to run, from the actor input. No Apify SDK here: the dataset itself is read in main.js.

export const EVENT_NAME = 'checked-email';
export const MAX_LINES = 200000;
export const BATCH_SIZE = 500;
export const SAMPLE_EMAILS = [
    'Jane.Doe@Gmail.COM',
    'mailto:info@apify.com',
    'john@gmai.com',
    'logo@2x.png',
    '5f3a9c1e7b2d4a6f8c0e1d3b5a7c9e2f@sentry.wixpress.com',
    'name@example.com',
    'temp@mailinator.com',
    'ceo@apify.com',
    'someone@this-domain-does-not-exist-af.com',
    'jane.doe@gmail.com',
];

const DATASET_ID = /^[A-Za-z0-9._~/-]{1,200}$/;

/** Splits a value that may hold several addresses ("a@x.com; b@y.com"). */
export const splitMany = (s) => s.split(/[;,\n\r]+/).map((x) => x.trim()).filter((x) => x !== '');

/** A value at a dotted path ("contact.email") in a dataset item, flattened to a list of strings. Anything that is not text is dropped. */
export function valuesAt(item, path) {
    let v = item;
    for (const key of path.split('.')) { if (v === null || typeof v !== 'object') return []; v = v[key]; }
    const out = [];
    const walk = (x) => { if (typeof x === 'string') out.push(...splitMany(x)); else if (Array.isArray(x)) x.forEach(walk); };
    walk(v);
    return out;
}

/** Does the item have the field at this dotted path at all (its value may be null, empty or a list)? */
export function hasPath(item, path) {
    let v = item;
    for (const key of path.split('.')) { if (v === null || typeof v !== 'object' || !(key in v)) return false; v = v[key]; }
    return true;
}

/**
 * With neither emails nor a dataset it runs the sample list, so the default run always returns data. What the caller gave is
 * never replaced by the sample: a dataset id that is malformed or a field name that is not text is an `error` (the run fails
 * before any lookup, so nothing is charged).
 */
export function planInput(input) {
    const warnings = [];
    let emails = [];
    if (typeof input.emails === 'string') emails = splitMany(input.emails);
    else if (Array.isArray(input.emails)) emails = input.emails;
    else if (input.emails !== undefined && input.emails !== null) return { error: 'emails must be a list of addresses or text with one address per line.', warnings };
    const datasetId = typeof input.datasetId === 'string' ? input.datasetId.trim() : '';
    if (input.datasetId !== undefined && input.datasetId !== null && typeof input.datasetId !== 'string') return { error: 'datasetId must be text.', warnings };
    if (datasetId !== '' && !DATASET_ID.test(datasetId)) return { error: `"${datasetId.slice(0, 40)}" is not a dataset id or name.`, warnings };
    const fieldRaw = input.field === undefined || input.field === null || input.field === '' ? 'email' : input.field;
    if (typeof fieldRaw !== 'string' || !/^[A-Za-z0-9_.$-]{1,100}$/.test(fieldRaw.trim())) return { error: 'field must be the name of a field in the dataset items, such as email or contact.email.', warnings };
    const dedupe = input.dedupe === undefined || input.dedupe === null ? true : input.dedupe !== false;
    const nothing = emails.length === 0 && datasetId === '';
    return { mode: nothing ? 'sample' : datasetId ? (emails.length ? 'both' : 'dataset') : 'emails', emails: nothing ? SAMPLE_EMAILS : emails, datasetId, field: fieldRaw.trim(), dedupe, warnings };
}
