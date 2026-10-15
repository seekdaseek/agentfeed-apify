import { Actor, log } from 'apify';
import { collect, cleanNames, getAgentFeed } from './agentfeed.js';
import { COIN_PATTERN, DEFAULT_COINS, EVENT_NAME, mapCoin } from './map.js';
import { pushItem } from './push.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const key = (process.env.AGENTFEED_KEY ?? '').trim();
if (!key) await Actor.fail('The actor is not configured: AGENTFEED_KEY is missing. This is the publisher\'s problem, not yours; you were not charged for any result.');

const { valid: coins, rejected } = cleanNames(input.coins, COIN_PATTERN, DEFAULT_COINS);
for (const r of rejected) log.warning(`"${r}" is not a Hyperliquid coin symbol (letters and digits, up to 15); skipped.`);

let withoutBands = 0;
const stats = await collect({
    names: coins,
    request: (coin) => getAgentFeed('/api/hl-whales', { coin }, { key }),
    toItem: (coin, body) => mapCoin(coin, body),
    push: (item) => pushItem(item, {
        pushCharged: (i) => Actor.pushData(i, EVENT_NAME),
        pushFree: (i) => { withoutBands++; return Actor.pushData(i); },
    }),
    log,
});

const summary = `${stats.pushed} of ${coins.length} coins returned${withoutBands ? ` (${withoutBands} without bands, not charged)` : ''}${stats.failed + stats.empty ? `, ${stats.failed + stats.empty} had no data (not charged)` : ''}`;
await Actor.setStatusMessage(summary);
log.info(summary);
if (stats.authFailed) await Actor.fail('The data source rejected the actor\'s key. This is the publisher\'s problem, not yours; no result was charged.');
await Actor.exit();
