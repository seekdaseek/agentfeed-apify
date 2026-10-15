import { Actor, log } from 'apify';
import { cleanList, collectMany } from './multi.js';
import { getAgentFeed } from './agentfeed.js';
import { EVENT_NAME, mapExtract, planInput } from './map.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const key = (process.env.AGENTFEED_KEY ?? '').trim();
if (!key) await Actor.fail('The actor is not configured: AGENTFEED_KEY is missing. This is the publisher\'s problem, not yours; you were not charged for any result.');

const plan = planInput(input, cleanList);
for (const w of plan.warnings) log.warning(w);
if (plan.error) await Actor.fail(`${plan.error} Nothing was charged.`);

// One URL at a time: each call fetches the page and reads it with a language model, and the box that answers has little memory.
const stats = await collectMany({
    jobs: plan.jobs,
    label: (job) => `URL ${job.name.slice(0, 120)}`,
    request: (job) => getAgentFeed('/api/extract', { url: job.name, schema: plan.schemaJson }, { key, timeoutMs: 60000 }),
    toItems: (job, body) => mapExtract(job.name, body),
    push: (items) => Actor.pushData(items, EVENT_NAME),
    log,
});

const skipped = stats.failed + stats.empty;
const summary = `${stats.pushed} of ${plan.jobs.length} pages extracted${skipped ? `, ${skipped} had nothing to return (not charged)` : ''}`;
await Actor.setStatusMessage(summary);
log.info(summary);
if (stats.authFailed) await Actor.fail('The data source rejected the actor\'s key. This is the publisher\'s problem, not yours; no result was charged.');
await Actor.exit();
