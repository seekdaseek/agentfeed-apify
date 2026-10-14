import { Actor, log } from 'apify';
import { cleanList, collectMany } from './multi.js';
import { getAgentFeed } from './agentfeed.js';
import { EVENT_NAME, mapFilings, planJobs } from './map.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const key = (process.env.AGENTFEED_KEY ?? '').trim();
if (!key) await Actor.fail('The actor is not configured: AGENTFEED_KEY is missing. This is the publisher\'s problem, not yours; you were not charged for any result.');

const { jobs, form, limit, error, warnings } = planJobs(input, cleanList);
if (error) await Actor.fail(`${error} Nothing was run and you were not charged.`);
for (const w of warnings) log.warning(w);

const stats = await collectMany({
    jobs,
    label: (job) => `ticker ${job.name}`,
    request: (job) => getAgentFeed('/api/sec-filings', { ticker: job.name, limit, ...(form ? { form } : {}) }, { key }),
    toItems: (job, body) => mapFilings(job.name, body),
    push: (items) => Actor.pushData(items, EVENT_NAME),
    log,
});

const skipped = stats.failed + stats.empty;
const summary = `${stats.pushed} filings for ${jobs.length - skipped} of ${jobs.length} tickers${skipped ? `, ${skipped} had nothing to return (not charged)` : ''}`;
await Actor.setStatusMessage(summary);
log.info(summary);
if (stats.authFailed) await Actor.fail('The data source rejected the actor\'s key. This is the publisher\'s problem, not yours; no result was charged.');
await Actor.exit();
