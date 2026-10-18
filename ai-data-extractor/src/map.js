// Input handling and mapping for AgentFeed's /api/extract (one caller-supplied URL and a field schema to JSON).

export const EVENT_NAME = 'extracted-page';
export const SOURCE = 'AgentFeed, page or PDF fetched once from the URL you supplied';
export const DEFAULT_URLS = ['https://en.wikipedia.org/wiki/Solana_(blockchain_platform)'];
export const DEFAULT_SCHEMA = {
    name: 'string',
    original_author: 'string',
    initial_release_year: 'number',
    consensus_mechanism: 'string',
    native_token: 'string',
};
export const MAX_URLS = 50;
export const MAX_URL_CHARS = 2048;
export const MAX_FIELDS = 20;
export const MAX_FIELD_NAME_CHARS = 64;
export const FIELD_TYPES = ['string', 'number', 'boolean', 'date', 'string[]'];

const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** An absolute http or https URL without credentials, as typed (the data source decides what it will fetch). */
export function normalizeUrl(s) {
    if (s.length > MAX_URL_CHARS) return null;
    let u;
    try { u = new URL(s); } catch { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password || !u.hostname) return null;
    return s;
}

/**
 * The schema as the data source wants it: an object of 1 to 20 field names, each with one of the five types. Accepts the object
 * the input form gives or a JSON string from an API caller. Returns { schema } or { error } with the reason, in plain words.
 */
export function parseSchema(raw) {
    let value = raw;
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { return { error: 'The schema is not valid JSON. Give an object such as {"title": "string", "price": "number"}.' }; }
    }
    if (!isObject(value)) return { error: 'The schema must be an object that maps field names to types, such as {"title": "string", "price": "number"}.' };
    const schema = {};
    for (const [rawName, type] of Object.entries(value)) {
        const name = rawName.trim();
        if (!name || name.length > MAX_FIELD_NAME_CHARS) return { error: `A field name must be 1 to ${MAX_FIELD_NAME_CHARS} characters; "${rawName.slice(0, 40)}" is not.` };
        if (name in schema) return { error: `The field "${name}" appears twice.` };
        if (!FIELD_TYPES.includes(type)) return { error: `The field "${name}" has the type ${JSON.stringify(type)}; use one of: ${FIELD_TYPES.join(', ')}.` };
        schema[name] = type;
    }
    const n = Object.keys(schema).length;
    if (n < 1 || n > MAX_FIELDS) return { error: `The schema needs 1 to ${MAX_FIELDS} fields; it has ${n}.` };
    return { schema };
}

/**
 * What to run. With neither URLs nor a schema it runs the default page, so the default run always returns data. Anything the
 * caller did give is never replaced by a default: a missing schema, a missing URL list or a bad schema is an `error` (the run
 * fails before any request, so nothing is charged), and a rejected URL is reported in `warnings` and skipped.
 */
export function planInput(input, cleanList) {
    const u = cleanList(input.urls, { normalize: normalizeUrl, max: MAX_URLS });
    const noUrls = u.valid.length === 0 && u.rejected.length === 0;
    const noSchema = input.schema === undefined || input.schema === null || input.schema === '' || (isObject(input.schema) && Object.keys(input.schema).length === 0);
    const warnings = u.rejected.map((r) => `"${r}" is not an http or https URL (no credentials, up to ${MAX_URL_CHARS} characters, or over the limit of ${MAX_URLS}); skipped.`);
    if (noUrls && noSchema) return { jobs: DEFAULT_URLS.map((name) => ({ name })), schema: DEFAULT_SCHEMA, schemaJson: JSON.stringify(DEFAULT_SCHEMA), warnings };
    if (noSchema) return { error: 'Add the fields to extract: the schema is empty.', warnings };
    const parsed = parseSchema(input.schema);
    if (parsed.error) return { error: parsed.error, warnings };
    if (u.valid.length === 0) return { error: noUrls ? 'Add at least one page or PDF URL.' : 'None of the URLs is a valid http or https link.', warnings };
    return { jobs: u.valid.map((name) => ({ name })), schema: parsed.schema, schemaJson: JSON.stringify(parsed.schema), warnings };
}

/** A value the page really states: not null, not blank text, not an empty list. */
const stated = (v) => !(v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0));

/**
 * One item for the URL, or [] when there is nothing to sell. The data source answers 200 (and bills) when the page states none
 * of the fields, so an item with every field null must not become a charged item.
 */
export function mapExtract(url, body, fetchedAt = new Date().toISOString()) {
    const d = body?.data;
    if (!isObject(d) || !isObject(d.data)) return [];
    const entries = Object.entries(d.data);
    const found = entries.filter(([, v]) => stated(v)).length;
    if (found === 0) return [];
    return [{
        url,
        final_url: str(d.final_url) ?? url,
        kind: str(d.kind),
        page_title: str(d.title),
        data: d.data,
        fields_requested: entries.length,
        fields_found: found,
        null_fields: strings(d.null_fields),
        verbatim_fields: strings(d.verbatim_fields),
        truncated: d.truncated === true,
        pct_read: num(d.pct_read),
        source: SOURCE,
        fetched_at: fetchedAt,
    }];
}
