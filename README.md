# agentfeed-apify

[Apify](https://apify.com) actors that sell [AgentFeed](https://x402.ochinimus.app) liquidation data to people who pay in dollars instead of USDC per call.

| Actor | Folder | What it returns | AgentFeed route |
|---|---|---|---|
| Crypto Liquidation Map: real Hyperliquid positions | [`liquidation-map/`](liquidation-map) | Liquidation levels in 5% price bands from the open positions of the largest Hyperliquid accounts | `/api/hl-whales?coin=` |

Each folder is a complete actor: its `README.md` is the Apify Store listing.

## How it works

Per input item the actor makes one GET to `https://x402.ochinimus.app` with its AgentFeed key in the `X-AgentFeed-Key` header and pushes one dataset item with a pay-per-event charge (`Actor.pushData(item, eventName)`). A non-200 answer, or a 200 with nothing in it, pushes no item and so charges nothing. A rejected key (401, 402, 403) stops the run and fails it.

## The key

The key is a prepaid AgentFeed key (`afk_...`). It is **never in this repo**. It lives only in the Apify secret `agentfeedKey`, which each `.actor/actor.json` maps to the environment variable `AGENTFEED_KEY`:

~~~
npx apify-cli secrets add agentfeedKey "<key>"    # local secret, used by `apify run` and uploaded by `apify push`
~~~

## Develop

~~~
npm test                         # unit tests for both actors and the shared client
cd liquidation-map && npm install
ACTOR_TEST_PAY_PER_EVENT=true ACTOR_USE_CHARGING_LOG_DATASET=true npx apify-cli run --purge --input '{"coins":["BTC","NOPE"]}'
cat storage/datasets/charging_log/*.json     # one entry per charged result; NOPE has none
~~~

`shared/agentfeed.js` is the client and loop used by both actors. An Apify build only sees its own folder, so it is copied into each `src/`; edit `shared/` and run `npm run sync`. A test fails if a copy drifts.

## Deploy

~~~
cd liquidation-map && npx apify-cli push
~~~

Pay-per-event prices are set in the Apify Console (Actor, Publication, Monetization), not in this repo.

MIT licensed.
