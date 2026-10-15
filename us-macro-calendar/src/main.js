import { Actor, log } from 'apify';
import { collectMany } from './multi.js';
import { getAgentFeed } from './agentfeed.js';
import { EVENT_NAME, mapCalendar, planInput } from './map.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const key = (process.env.AGENTFEED_KEY ?? '').trim();
if (!key) await Actor.fail('The actor is not configured: AGENTFEED_KEY is missing. This is the publisher\'s problem, not yours; you were not charged for any result.');

const plan = planInput(input);
for (const w of plan.warnings) log.warning(w);
if (plan.error) await Actor.fail(`${plan.error} Nothing was charged.`);

// One request lists every release in the window; the chosen types are filtered here. Each row returned is one result.
const stats = await collectMany({
    jobs: [{ name: 'US macro calendar' }],
    request: () => getAgentFeed('/api/macro-calendar', { days: plan.days }, { key }),
    toItems: (job, body) => {
        const missing = Array.isArray(body?.data?.unavailable) ? body.data.unavailable.filter((u) => typeof u === 'string' || (u && typeof u.type === 'string')) : [];
        if (missing.length > 0) log.warning(`The data source could not verify some schedules right now: ${JSON.stringify(missing).slice(0, 200)}.`);
        return mapCalendar(plan.types, body);
    },
    push: (items) => Actor.pushData(items, EVENT_NAME),
    log,
});

const summary = stats.pushed > 0
    ? `${stats.pushed} release${stats.pushed === 1 ? '' : 's'} listed (${plan.types.join(', ')}, next ${plan.days} days)`
    : `No ${plan.types.join(', ')} release in the next ${plan.days} days, or the schedule could not be read; nothing returned and nothing charged`;
await Actor.setStatusMessage(summary);
log.info(summary);
if (stats.authFailed) await Actor.fail('The data source rejected the actor\'s key. This is the publisher\'s problem, not yours; no result was charged.');
await Actor.exit();
