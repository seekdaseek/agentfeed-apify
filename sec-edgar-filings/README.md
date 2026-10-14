# SEC EDGAR Filings by Ticker: 10-K, 10-Q, 8-K, Form 4

**Recent SEC EDGAR filings for any US-listed ticker, one clean JSON item per filing: form type, filing date, report date, accession number, description, 8-K item codes and links to the document and the filing index.**

Give the actor a list of tickers and, optionally, one form type. It reads each company's filing list from EDGAR at the moment you run it and returns the most recent filings, newest first. No scraping, no proxies, no HTML parsing, and no need to look up CIK numbers: the ticker is enough.

## What you get, per filing

- **Ticker, company name and CIK** of the filer.
- **Form type** (10-K, 10-Q, 8-K, 4, S-1, 13F-HR, DEF 14A and the rest of EDGAR's forms).
- **Filing date** and **report date** (the period or event date the filing reports on, where the form has one).
- **Accession number**, the identifier of the filing on EDGAR.
- **Description** of the primary document, as EDGAR lists it.
- **8-K item codes**, for example `2.02,9.01`, so you can tell an earnings release from a leadership change.
- **Links** to the primary document and to the filing's index page on sec.gov.
- `source` and `fetched_at` on every item.

## Use cases

- Watch a list of tickers for new 8-K filings and read the item codes to see what kind of event it is.
- Follow insider activity: pull the latest Form 4 filings for a ticker.
- Collect the latest 10-K and 10-Q links for a portfolio or a research list.
- Feed a bot, a spreadsheet or an alert on an Apify schedule, and export the results as JSON, CSV or Excel.
- Look up the accession number and document link for a known filing.

## Input

| Field | Type | Default | Description |
|---|---|---|---|
| `tickers` | array of strings | prefill `["AAPL"]` | US-listed tickers (up to 50), for example `AAPL`, `MSFT`, `BRK-B`. Case does not matter. |
| `form` | string | none | Optional. One EDGAR form type, for example `10-K`, `10-Q`, `8-K`, `4`, `S-1`, `DEF 14A`, `13F-HR`. Empty means the most recent filings of any type. |
| `limit_per_ticker` | integer | `10` | How many of the most recent filings to return per ticker, 1 to 50. |

With no input at all, the actor returns the 10 most recent filings of `AAPL`, so the default run always returns data.

## How to run it

**In the Apify Console:** open the Actor, enter tickers (and a form type if you want one) in the Input tab and click Start. The dataset has an **Overview** table (one row per filing) and can be exported as JSON, CSV or Excel.

**Through the API:** one request starts a run and returns the items (replace `YOUR_API_TOKEN` with your Apify API token):

```bash
curl -X POST "https://api.apify.com/v2/acts/ochinimus~sec-edgar-filings/run-sync-get-dataset-items" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tickers": ["AAPL", "MSFT"], "form": "8-K", "limit_per_ticker": 5}'
```

The answer is a JSON array with one item per filing. See the Apify API docs for asynchronous runs and schedules.

## Sample output

Two real results, captured live on 14 Oct 2026 (an insider Form 4 and an 8-K with item codes).

```json
[
  {
    "ticker": "AAPL",
    "company": "Apple Inc.",
    "cik": "0000320193",
    "form": "4",
    "filing_date": "2026-10-08",
    "report_date": "2026-10-06",
    "accession_number": "0001140361-26-039158",
    "description": "FORM 4",
    "items": null,
    "document_url": "https://www.sec.gov/Archives/edgar/data/320193/000114036126039158/xslF345X06/form4.xml",
    "index_url": "https://www.sec.gov/Archives/edgar/data/320193/000114036126039158/0001140361-26-039158-index.htm",
    "source": "SEC EDGAR (sec.gov), public filings, via AgentFeed (x402.ochinimus.app)",
    "fetched_at": "2026-10-14T15:31:37.353Z"
  },
  {
    "ticker": "AAPL",
    "company": "Apple Inc.",
    "cik": "0000320193",
    "form": "8-K",
    "filing_date": "2026-07-30",
    "report_date": "2026-07-30",
    "accession_number": "0000320193-26-000018",
    "description": "8-K",
    "items": "2.02,9.01",
    "document_url": "https://www.sec.gov/Archives/edgar/data/320193/000032019326000018/aapl-20260730.htm",
    "index_url": "https://www.sec.gov/Archives/edgar/data/320193/000032019326000018/0000320193-26-000018-index.htm",
    "source": "SEC EDGAR (sec.gov), public filings, via AgentFeed (x402.ochinimus.app)",
    "fetched_at": "2026-10-14T15:31:53.624Z"
  }
]
```

## Pricing

Pay per event: **$0.002 per filing returned** (event `filing`), plus Apify's tiny per-run start fee.

You are charged only for filings that come back. A ticker that is not in the SEC's company ticker list, a form type the company has never filed, a form with no filings, and any data-source error return nothing and cost nothing.

## Data source and its limits

- **Source: SEC EDGAR (sec.gov), public filings, through AgentFeed (x402.ochinimus.app).** EDGAR is public: its filings are free to access and reuse. This actor cites the source on every item.
- **Not affiliated with the U.S. Securities and Exchange Commission,** and not endorsed by it.
- **Metadata and links, not filing text.** You get the filing's date, form, description and links; open the document link for the content.
- **US-listed tickers only**, as listed in the SEC's company ticker list. Foreign private issuers file different forms (for example 6-K and 20-F), so use the `form` field accordingly.
- **Most recent first, up to 50 per ticker.** The list is read from EDGAR at request time, so it is as current as EDGAR's own publication.
- A form type that is not a common EDGAR form and that the company has never filed is treated as a typo and returns nothing.
- EDGAR limits how fast it can be queried, and the data source stays under that limit, so a very large input is processed one ticker at a time and takes a little longer.
- This is data, not advice, and you are responsible for how you use it.

## Built for agents too

The same data is sold per call to AI agents over the x402 protocol (USDC, no account): [x402.ochinimus.app](https://x402.ochinimus.app), route `/api/sec-filings`, OpenAPI at [x402.ochinimus.app/openapi.json](https://x402.ochinimus.app/openapi.json).

Source code: [github.com/seekdaseek/agentfeed-apify](https://github.com/seekdaseek/agentfeed-apify) (MIT), folder `sec-edgar-filings`.
