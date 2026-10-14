import { Actor, log } from 'apify';
import { cleanList, collectMany } from './multi.js';
import { getAgentFeed } from './agentfeed.js';
import { EVENT_NAME, mapDoi, mapSearch, planJobs } from './map.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const key = (process.env.AGENTFEED_KEY ?? '').trim();
if (!key) await Actor.fail('The actor is not configured: AGENTFEED_KEY is missing. This is the publisher\'s problem, not yours; you were not charged for any result.');

const { jobs, year, limit, warnings } = planJobs(input, cleanList);
for (const w of warnings) log.warning(w);

const stats = await collectMany({
    jobs,
    label: (job) => `${job.kind === 'doi' ? 'DOI' : 'query'} "${job.name}"`,
    request: (job) => (job.kind === 'doi'
        ? getAgentFeed(`/api/paper/${encodeURIComponent(job.name)}`, {}, { key })
        : getAgentFeed('/api/papers', { q: job.name, limit, ...(year ? { year_from: year } : {}) }, { key })),
    toItems: (job, body) => (job.kind === 'doi' ? mapDoi(job.name, body) : mapSearch(job.name, body)),
    push: (items) => Actor.pushData(items, EVENT_NAME),
    log,
});

const skipped = stats.failed + stats.empty;
const summary = `${stats.pushed} papers from ${jobs.length - skipped} of ${jobs.length} inputs${skipped ? `, ${skipped} had nothing to return (not charged)` : ''}`;
await Actor.setStatusMessage(summary);
log.info(summary);
if (stats.authFailed) await Actor.fail('The data source rejected the actor\'s key. This is the publisher\'s problem, not yours; no result was charged.');
await Actor.exit();
