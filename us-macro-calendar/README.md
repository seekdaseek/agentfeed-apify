# US Economic Calendar: FOMC, CPI, NFP and PCE release dates

**The next Fed rate decisions and the CPI, nonfarm payrolls (NFP) and PCE release dates, with New York and UTC times, read from the official Federal Reserve, BLS and BEA schedules. One JSON row per release, each with its source URL.**

Choose which releases you want and how many days ahead, and the actor returns one row per release in date order: the date and time in New York, the same moment in UTC (daylight saving handled), the days until it, whether it is the next of its type, and the official page the date was read from. No scraping of third-party calendars, no dates typed in by hand.

## What you get, per release

- **type:** `FOMC` (the Fed rate decision day, when the statement comes out), `CPI` (consumer price index), `NFP` (nonfarm payrolls, the monthly jobs report) or `PCE` (the PCE price index, from personal income and outlays).
- **title** (the official name), **agency** (Federal Reserve, Bureau of Labor Statistics or Bureau of Economic Analysis) and **reference_period** (the month the figures cover; empty for FOMC).
- **date** and **time_new_york** (as published), and **utc**: the same moment in UTC, converted for that date, so daylight saving is right.
- **days_until** (whole days from the moment of the run) and **is_next** (true for the first upcoming release of its type).
- **press_conference** for FOMC decisions: whether the meeting includes a press conference.
- **source_url** (the official Fed, BLS or BEA page the date was read from), **verified_at** (when the data source last checked it), **source** and **fetched_at**.

## What it does not return

Dates and times only. There are **no actual, forecast or previous values**, no other countries, and no other US releases: only these four. If you need the numbers of a release, read them from the agency named in `source_url`.

## Use cases

- Let a trading bot or an AI agent skip or size down positions around FOMC, CPI, NFP and PCE.
- Put the dates of the macro releases that move crypto and stocks into a calendar, a Slack channel or a dashboard.
- Schedule data pulls or alerts for the minutes after a release, with the UTC time ready to use.
- Keep a spreadsheet of the next 12 months of Fed, BLS and BEA dates, refreshed on an Apify schedule.

## Input

| Field | Type | Default | Description |
|---|---|---|---|
| `types` | array of `FOMC`, `CPI`, `NFP`, `PCE` | all four | Which releases to list. |
| `days` | integer, 1 to 365 | 90 | How many days ahead to list. The sources publish about a year of dates, so a longer window holds no more rows. |

With no input at all, the actor lists all four releases for the next 90 days, so the default run always returns rows.

## How to run it

**In the Apify Console:** open the Actor, pick the releases and the window in the Input tab and click Start. The dataset has an **Overview** table (one row per release) and exports as JSON, CSV or Excel.

**Through the API:** one request starts a run and returns the items (replace `YOUR_API_TOKEN` with your Apify API token):

```bash
curl -X POST "https://api.apify.com/v2/acts/ochinimus~us-macro-calendar/run-sync-get-dataset-items" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"types": ["FOMC", "CPI"], "days": 60}'
```

The answer is a JSON array with one item per release in the window.

## Sample output

A real result (the first row of the default run), captured live on 15 Oct 2026:

```json
{
  "type": "FOMC",
  "title": "FOMC rate decision (statement)",
  "agency": "Federal Reserve",
  "reference_period": null,
  "date": "2026-10-28",
  "time_new_york": "14:00",
  "utc": "2026-10-28T18:00:00.000Z",
  "days_until": 13,
  "is_next": true,
  "press_conference": true,
  "source_url": "https://www.federalreserve.gov/json/calendar.json",
  "verified_at": "2026-10-15T05:23:01.935Z",
  "source": "AgentFeed (x402.ochinimus.app), dates read from the Federal Reserve, BLS and BEA pages named in each row",
  "fetched_at": "2026-10-15T10:04:52.338Z"
}
```

## Pricing

Pay per event: **$0.005 per release** (event `release`), plus Apify's tiny per-run start fee. The default run (all four releases, 90 days) returns about 9 rows.

You are charged only for rows that come back. A window with no release of the types you chose returns nothing and costs nothing, and so does a moment when the data source cannot verify its schedules (it stops answering when its newest check is more than 35 days old). A request with no valid release type or an invalid number of days stops the run before any request.

## Data source and its limits

- **Source: AgentFeed (x402.ochinimus.app).** Dates and times are read every day from the Federal Reserve, BLS and BEA pages named in each row, never entered by hand; `utc` is converted from America/New_York for that date.
- **FOMC rows are the decision day** (the statement) of each meeting.
- **The sources publish about a year ahead,** so the window never shows more than that, and an agency can reschedule a release: check `verified_at`.
- The window is 1 to 365 days.

## Built for agents too

The same calendar is sold per call to AI agents over the x402 protocol (USDC, no account): [x402.ochinimus.app](https://x402.ochinimus.app), route `/api/macro-calendar`, OpenAPI at [x402.ochinimus.app/openapi.json](https://x402.ochinimus.app/openapi.json).

Source code: [github.com/seekdaseek/agentfeed-apify](https://github.com/seekdaseek/agentfeed-apify) (MIT), folder `us-macro-calendar`.
