import fs from 'node:fs';
import { Actor, log } from 'apify';
import { createCleaner, newReturned, tallyReturned } from './clean.js';
import { createResolver } from './dns.js';
import { BATCH_SIZE, EVENT_NAME, MAX_LINES, hasPath, planInput, valuesAt } from './plan.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const plan = planInput(input);
for (const w of plan.warnings) log.warning(w);
if (plan.error) await Actor.fail(`${plan.error} Nothing was checked and nothing was charged.`);

const disposableSet = new Set(fs.readFileSync(new URL('../data/disposable-domains.txt', import.meta.url), 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')));
const resolver = createResolver({ log: (m) => log.warning(m) });
const cleaner = createCleaner({ lookup: (d) => resolver.lookup(d), disposableSet, dedupe: plan.dedupe });

let stopped = false;
const returned = newReturned();
let seenLines = 0;

/** Pushes one processed batch in input order: each run of consecutive charged rows is one charged push, the rest are free. */
async function pushEntries(entries) {
    let i = 0;
    while (i < entries.length && !stopped) {
        let j = i;
        while (j < entries.length && entries[j].charged === entries[i].charged) j++;
        const rows = entries.slice(i, j).map((e) => e.record);
        // The SDK writes only as many charged rows as the run's maximum charge still allows. Its chargedCount is not a row count (it
        // came back at twice the rows written on SDK 3.7.2), so the number written is worked out before the push.
        const left = entries[i].charged ? Actor.getChargingManager().calculateMaxEventChargeCountWithinLimit(EVENT_NAME) : Infinity;
        const written = Number.isFinite(left) ? Math.min(rows.length, Math.max(0, left)) : rows.length;
        const result = entries[i].charged ? await Actor.pushData(rows, EVENT_NAME) : await Actor.pushData(rows);
        tallyReturned(returned, rows, entries[i].charged, written);
        if (result?.eventChargeLimitReached) { stopped = true; log.warning('The run reached its maximum charge; stopping. The rows already returned are kept.'); }
        i = j;
    }
}

async function handle(lines) {
    for (let k = 0; k < lines.length && !stopped; k += BATCH_SIZE) {
        const room = MAX_LINES - seenLines;
        if (room <= 0) { stopped = true; log.warning(`More than ${MAX_LINES} lines: only the first ${MAX_LINES} were checked.`); return; }
        const batch = lines.slice(k, k + Math.min(BATCH_SIZE, room));
        seenLines += batch.length;
        await pushEntries(await cleaner.process(batch));
        await Actor.setStatusMessage(`${cleaner.counters.unique} unique addresses checked so far`);
    }
}

if (plan.emails.length > 0) {
    if (plan.mode !== 'sample' && !plan.emails.some((e) => typeof e === 'string' && e.includes('@'))) {
        await Actor.fail(`None of the ${plan.emails.length} values looks like an email address (no "@" in any of them). Nothing was checked and nothing was charged.`);
    }
    await handle(plan.emails);
}

if (plan.datasetId) {
    const client = Actor.newClient();
    const ds = client.dataset(plan.datasetId);
    let info;
    let problem = '';
    try { info = await ds.get(); } catch (e) { problem = ` (${e?.statusCode ?? 'error'}: ${String(e?.message ?? '').slice(0, 120)})`; }
    if (!info) await Actor.fail(`The dataset "${plan.datasetId}" was not found, or this run cannot read it${problem}. Pick the dataset in the input (or pass its id through the API) so the run is given read access to it. Nothing was charged.`);
    log.info(`Reading dataset ${info.id}: ${info.itemCount} items, field "${plan.field}".`);
    const PAGE = 1000;
    let found = 0;
    for (let offset = 0; offset < info.itemCount && !stopped; offset += PAGE) {
        const { items } = await ds.listItems({ offset, limit: PAGE });
        const lines = items.flatMap((item) => valuesAt(item, plan.field));
        found += lines.length;
        // a field that is there but empty (a scraper that found no email on a page) is an empty result, not a failure: this actor is
        // also started by integrations after a scraper run, and a scraper run with no emails must not turn the chain red
        if (offset === 0 && lines.length === 0 && items.length > 0 && !items.some((item) => hasPath(item, plan.field))) {
            const fields = Object.keys(items[0] ?? {}).slice(0, 12).join(', ');
            await Actor.fail(`The field "${plan.field}" holds no text in the first ${items.length} items. Fields in the first item: ${fields || 'none'}. Nothing was charged.`);
        }
        if (offset === 0 && lines.length > 0 && !lines.some((l) => l.includes('@'))) {
            await Actor.fail(`None of the values in the field "${plan.field}" looks like an email address (no "@" in the first ${lines.length}). Nothing was checked and nothing was charged.`);
        }
        await handle(lines);
    }
    if (found === 0) log.warning('The dataset has no addresses to check.');
}

const c = cleaner.counters;
const summary = {
    mode: plan.mode, dedupe: plan.dedupe, processed: c, returned, resolver: resolver.path, resolver_lookups: resolver.stats, domains_looked_up: cleaner.domainCount(),
    stopped_at_max_charge: stopped, finished_at: new Date().toISOString(),
};
await Actor.setValue('SUMMARY', summary);
const message = returned.rows === 0
    ? `Nothing to check${c.blank ? ` (${c.blank} blank lines skipped)` : ''}; nothing charged`
    : `${returned.rows} rows returned: ${returned.valid} valid, ${returned.risky} risky, ${returned.invalid} invalid, ${returned.unknown} unknown (free); ${c.duplicates} duplicates ${plan.dedupe ? 'dropped' : 'marked'}; ${returned.charged} charged; DNS via ${resolver.path}${stopped ? '; stopped at your maximum charge, the rest was not checked' : ''}`;
await Actor.setStatusMessage(message);
log.info(message);
await Actor.exit();
