# agentfeed-apify

[Apify](https://apify.com) actors that sell [AgentFeed](https://x402.ochinimus.app) data to people who pay in dollars instead of USDC per call.

## On the Apify Store

Four public actors, billed in fiat through Apify, so no wallet is needed. Prices are per result, plus Apify's $0.00005 start fee per run.

| Folder | Store URL | Price | What it returns |
|---|---|---|---|
| [`liquidation-map/`](liquidation-map) | [apify.com/ochinimus/crypto-liquidation-map-hyperliquid](https://apify.com/ochinimus/crypto-liquidation-map-hyperliquid) | $0.008 per coin | Liquidation heatmap data: USD at risk in each 5% price band, from the open positions of the largest Hyperliquid accounts |
| [`scholarly-paper-search/`](scholarly-paper-search) | [apify.com/ochinimus/scholarly-paper-search](https://apify.com/ochinimus/scholarly-paper-search) | $0.003 per paper | Papers from OpenAlex's CC0 data, by search or DOI |
| [`us-company-filings/`](us-company-filings) | [apify.com/ochinimus/us-company-filings](https://apify.com/ochinimus/us-company-filings) | $0.002 per filing | Recent public filings from the SEC's EDGAR system, per ticker |
| [`pdf-to-markdown/`](pdf-to-markdown) | [apify.com/ochinimus/pdf-to-markdown](https://apify.com/ochinimus/pdf-to-markdown) | $0.01 per PDF | The text of a PDF as markdown, page by page |

## The AgentFeed routes behind them

| Actor | Folder | What it returns | AgentFeed route |
|---|---|---|---|
| Crypto Liquidation Heatmap & Map: real Hyperliquid positions | [`liquidation-map/`](liquidation-map) | Liquidation levels in 5% price bands from the open positions of the largest Hyperliquid accounts | `/api/hl-whales?coin=` |
| Scholarly Paper Search: OpenAlex, Google Scholar alternative | [`scholarly-paper-search/`](scholarly-paper-search) | Papers from OpenAlex (CC0 data) by search or DOI: title, year, authors, venue, citations, open-access link | `/api/papers`, `/api/paper/{doi}` |
| US Company Filings by Ticker: 10-K, 10-Q, 8-K, Form 4 | [`us-company-filings/`](us-company-filings) | Recent public filings from the SEC's EDGAR system per ticker, with dates, accession numbers, 8-K items and links | `/api/sec-filings` |
| PDF to Markdown: clean text from any PDF URL | [`pdf-to-markdown/`](pdf-to-markdown) | Page-by-page markdown text of text-layer PDFs | `/api/pdf-markdown` |

Each folder is a complete actor: its `README.md` is the Apify Store listing. Each actor calls AgentFeed with its own key, stored only as an Apify secret.

## How it works

Per input item each actor makes one GET to `https://x402.ochinimus.app` with its AgentFeed key in the `X-AgentFeed-Key` header and pushes one dataset item with a pay-per-event charge (`Actor.pushData(item, eventName)`). A non-200 answer, or a 200 with nothing in it, pushes no item and so charges nothing. A rejected key (401, 402, 403) stops the run and fails it. The actors that can return several items per request (papers, filings, PDFs) process one input at a time through `shared/multi.js`.

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
