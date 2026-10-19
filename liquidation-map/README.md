# Crypto Liquidation Heatmap & Map: real Hyperliquid positions

**Liquidation heatmap data for BTC, ETH, SOL and any Hyperliquid perp: the USD at risk in each price band, long and short, computed from the real open positions of the largest Hyperliquid accounts. Not leverage estimates.**

Most liquidation maps guess: they assume a leverage mix and draw where positions would be wiped out. This actor reads what the biggest Hyperliquid accounts really hold. For every open position it takes the exchange's own liquidation price, then adds up the USD notional that sits in each price band. You get the long and short USD at risk per band, the largest individual positions with their liquidation prices, and the mark price, as one clean JSON item per coin.

## What you get, per coin

- **Liquidation bands:** up to 20 bands, each 5% of the mark price wide, from -50% to +50% around the mark. Per band: USD notional of **long** positions and of **short** positions whose liquidation price falls in it. Bands with no positions are left out.
- **Largest positions** (up to 20): address, side, size, notional USD, entry price, liquidation price, distance to liquidation in %, unrealized PnL, leverage, margin mode.
- **Long and short totals:** accounts, notional, size-weighted entry, notional-weighted distance to liquidation, USD within 10% of liquidation, unrealized PnL.
- **Mark price, net USD, `as_of` (when the positions were read) and `fetched_at`.**
- A `source` line on every item.

Coins whose tracked positions sit far from liquidation can return few or no bands; a coin with no bands is not charged.

## Use cases

- See at which prices the largest Hyperliquid accounts would be liquidated, coin by coin, from their real liquidation prices.
- Compare long against short USD at risk around the mark price, band by band.
- Watch the biggest open positions in a coin: account, side, entry, liquidation price, leverage and unrealized PnL.
- Feed a bot, spreadsheet or dashboard: run the actor on an Apify schedule or call it through the API. The positions behind it are refreshed every 5 minutes at most, so polling faster returns the same snapshot (`as_of` tells you).
- Export the results as JSON, CSV or Excel.

## Coming from a CoinGlass heatmap Actor?

This Actor is not a drop-in replacement. It does not accept the `symbol`, `model` or `interval` inputs, and its output has different fields. If you want to try it, send `coins` where you sent `symbol`, for example `{"coins": ["ETH"]}`.

You get, for each coin, the USD at risk in each 5% price band, long and short, and the 20 largest positions with address, liquidation price and leverage, all from real Hyperliquid positions.

You do not get cross-exchange estimates, a time axis, candles, or stock and commodity tickers.

## Input

| Field | Type | Default | Description |
|---|---|---|---|
| `coins` | array of strings | `["BTC","ETH","SOL"]` | Hyperliquid perp symbols, e.g. `BTC`, `ETH`, `SOL`, `HYPE`, `DOGE`. Case does not matter. Up to 50 per run. |

## How to run it

**In the Apify Console:** open the Actor, enter the coins in the Input tab (one symbol per line; the default is BTC, ETH and SOL) and click Start. The dataset has two table views, **Overview** (one row per coin) and **Liquidation bands** (one row per 5% band and coin), and can be exported as JSON, CSV or Excel.

**Through the API:** one request starts a run and returns the items (replace `YOUR_API_TOKEN` with your Apify API token):

```bash
curl -X POST "https://api.apify.com/v2/acts/ochinimus~crypto-liquidation-map-hyperliquid/run-sync-get-dataset-items" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": ["BTC", "ETH"]}'
```

The answer is a JSON array with one item per coin that returned data. See the Apify API docs for asynchronous runs and schedules.

## Sample output

A real result for BTC, captured live on 14 Oct 2026 and shortened for this page (2 of 7 bands, 2 of 20 positions). The full item is in [`examples/BTC.json`](https://github.com/seekdaseek/agentfeed-apify/blob/main/liquidation-map/examples/BTC.json).

```json
{
  "coin": "BTC",
  "mark_price": 83798,
  "as_of": "2026-10-14T12:15:09.697Z",
  "fetched_at": "2026-10-14T12:19:05.413Z",
  "net_usd": -453411672.45,
  "long": {
    "accounts": 13,
    "notional_usd": 283417550.64,
    "avg_entry_px": 73993.23,
    "avg_liq_distance_pct": 41.31,
    "within_10pct_of_liq_usd": 0,
    "unrealized_pnl_usd": 33169969.28
  },
  "short": {
    "accounts": 23,
    "notional_usd": 736829223.09,
    "avg_entry_px": 78499.92,
    "avg_liq_distance_pct": 101.75,
    "within_10pct_of_liq_usd": 0,
    "unrealized_pnl_usd": -46592300.49
  },
  "liquidation_bands": [
    {
      "price_from": 41899,
      "price_to": 46088.9,
      "long_usd_at_risk": 41900500,
      "short_usd_at_risk": 0
    },
    {
      "price_from": 117317.2,
      "price_to": 121507.1,
      "long_usd_at_risk": 0,
      "short_usd_at_risk": 28932913.7
    }
  ],
  "largest_positions": [
    {
      "address": "0x5b5d51203a0f9079f8aeb098a6523a13f298c060",
      "side": "short",
      "size": 2753.19991,
      "notional_usd": 230712646.06,
      "entry_px": 76168.3,
      "liquidation_px": 143809.6513570304,
      "liq_distance_pct": 71.61,
      "unrealized_pnl_usd": -21005944.11,
      "leverage": 5,
      "margin_mode": "cross"
    },
    {
      "address": "0xb83de012dba672c76a7dbbbf3e459cb59d7d6e36",
      "side": "short",
      "size": 2485.16462,
      "notional_usd": 208251824.83,
      "entry_px": 77751.1,
      "liquidation_px": 151482.6846046699,
      "liq_distance_pct": 80.77,
      "unrealized_pnl_usd": -15027454.33,
      "leverage": 5,
      "margin_mode": "cross"
    }
  ],
  "accounts_scanned": 250,
  "accounts_with_positions": 65,
  "source": "AgentFeed, Hyperliquid on-chain positions"
}
```

## Pricing

Pay per event: **$0.008 per coin returned**, plus Apify's tiny per-run start fee.

You are charged only for a coin that comes back with data. A coin Hyperliquid does not list, a coin none of the tracked accounts hold, or a data-source error returns no item and costs nothing.

## Data source and its limits

- Source: **AgentFeed, our own data service, Hyperliquid on-chain positions.** The positions are read from Hyperliquid's public account state; the accounts are public addresses as Hyperliquid publishes them.
- **Hyperliquid only.** This is not the whole market: the map shows where *these accounts'* positions would be liquidated, not Binance, Bybit or OKX leverage.
- **The largest accounts only.** The list is the top 250 accounts by account value on the Hyperliquid leaderboard, re-read hourly (`accounts_scanned` and `accounts_with_positions` are in every item). Many of them hold no position in a given coin.
- **A snapshot, not a stream.** Positions are refreshed every 5 minutes at most. If the data source is stale it answers an error and the actor returns nothing rather than old numbers.
- USD at risk is position **notional**, not margin.
- This is data, not financial advice.

## Source code

[github.com/seekdaseek/agentfeed-apify/tree/main/liquidation-map](https://github.com/seekdaseek/agentfeed-apify/tree/main/liquidation-map) (MIT).
