import { Actor, log } from 'apify';
import { cleanList, collectMany } from './multi.js';
import { getAgentFeed } from './agentfeed.js';
import { EVENT_NAME, mapPdf, planJobs } from './map.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const key = (process.env.AGENTFEED_KEY ?? '').trim();
if (!key) await Actor.fail('The actor is not configured: AGENTFEED_KEY is missing. This is the publisher\'s problem, not yours; you were not charged for any result.');

const { jobs, warnings } = planJobs(input, cleanList);
for (const w of warnings) log.warning(w);

// One PDF at a time: the converter on the other side has little memory and runs each file in its own capped process.
const stats = await collectMany({
    jobs,
    label: (job) => `PDF ${job.name.slice(0, 120)}`,
    request: (job) => getAgentFeed('/api/pdf-markdown', { url: job.name }, { key, timeoutMs: 45000 }),
    toItems: (job, body) => mapPdf(job.name, body),
    push: (items) => Actor.pushData(items, EVENT_NAME),
    log,
});

const skipped = stats.failed + stats.empty;
const summary = `${stats.pushed} of ${jobs.length} PDFs converted${skipped ? `, ${skipped} had nothing to return (not charged)` : ''}`;
await Actor.setStatusMessage(summary);
log.info(summary);
if (stats.authFailed) await Actor.fail('The data source rejected the actor\'s key. This is the publisher\'s problem, not yours; no result was charged.');
await Actor.exit();
