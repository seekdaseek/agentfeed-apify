# AI Data Extractor: web page or PDF to JSON by your schema

**Extract structured data from any web page or PDF with AI. You name the fields you want; you get one clean JSON object per URL. A field the page does not state comes back as `null`, never as a guess.**

Paste public page or PDF links and a small schema such as `{"price": "number", "in_stock": "boolean"}`. The actor fetches each document once, has a language model read it, and returns exactly those fields. No browser to run, no selectors to maintain, no prompt to write: the schema is the prompt.

## What you get, per URL

- **data:** one entry for every field in your schema, in your order: the value the page states, or `null` when it does not.
- **fields_found** and **fields_requested**, **null_fields** (which fields the page does not state) and **verbatim_fields** (which values were found word for word in the text).
- **kind** (`html` or `pdf`), **page_title**, **url** (what you supplied) and **final_url** (after redirects).
- **truncated** and **pct_read:** a long document is read up to about 20,000 tokens (roughly 70,000 characters); `truncated: true` and the share read tell you when only the first part was seen.
- **source** and **fetched_at**.

## Fields and types

| Type | Returns |
|---|---|
| `string` | text |
| `number` | a number, such as a price or a year |
| `boolean` | true or false |
| `date` | a date as `YYYY-MM-DD` |
| `string[]` | a list of text values, such as authors or tags |

One schema per run, 1 to 20 fields, the same for every URL.

## Use cases

- Pull the same facts (name, price, contact, date) from a list of product, company or news pages without writing selectors.
- Extract title, authors, abstract and year from a list of paper or report PDFs.
- Turn filings, spec sheets or invoices published as PDF into rows for a spreadsheet or a database.
- Give an AI agent a dependable way to read one page into typed fields.

## Input

| Field | Type | Default | Description |
|---|---|---|---|
| `urls` | array of strings | prefill: the Solana article on Wikipedia | Public http or https links to web pages or PDFs (up to 50). |
| `schema` | object | prefill: five fields for that article | Field names mapped to `string`, `number`, `boolean`, `date` or `string[]`, 1 to 20 fields. |

With no input at all, the actor runs that example page and schema, so the default run always returns data. If you give URLs without a schema, a schema without URLs, or an invalid schema, the run stops with a clear message before any request is made, and nothing is charged.

## How to run it

**In the Apify Console:** open the Actor, paste your links into the Input tab, edit the schema and click Start. The dataset has an **Overview** table (one row per URL, with the extracted data) and exports as JSON, CSV or Excel.

**Through the API:** one request starts a run and returns the items (replace `YOUR_API_TOKEN` with your Apify API token):

```bash
curl -X POST "https://api.apify.com/v2/acts/ochinimus~ai-data-extractor/run-sync-get-dataset-items" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://bitcoin.org/bitcoin.pdf"], "schema": {"title": "string", "author": "string", "abstract": "string"}}'
```

The answer is a JSON array with one item per URL that returned at least one of your fields.

## Sample output

A real result for the default input (the Solana article on Wikipedia), captured live on 15 Oct 2026:

```json
{
  "url": "https://en.wikipedia.org/wiki/Solana_(blockchain_platform)",
  "final_url": "https://en.wikipedia.org/wiki/Solana_(blockchain_platform)",
  "kind": "html",
  "page_title": "Solana (blockchain platform)",
  "data": {
    "name": "Solana",
    "original_author": "Anatoly Yakovenko, Raj Gokal",
    "initial_release_year": 2020,
    "consensus_mechanism": "proof-of-stake",
    "native_token": "SOL"
  },
  "fields_requested": 5,
  "fields_found": 5,
  "null_fields": [],
  "verbatim_fields": [
    "name",
    "original_author",
    "consensus_mechanism",
    "native_token"
  ],
  "truncated": false,
  "pct_read": 100,
  "source": "AgentFeed, page or PDF fetched once from the URL you supplied",
  "fetched_at": "2026-10-15T09:58:50.000Z"
}
```

## Pricing

Pay per event: **$0.02 per page or PDF extracted** (event `extracted-page`), plus Apify's tiny per-run start fee.

You are charged only for a URL that returns at least one of your fields. A link that cannot be fetched, a site whose robots.txt forbids it, a private or blocked address, a file that is not a web page or a PDF, a document over 10 MB, a page that states none of your fields, and any data-source error return nothing and cost nothing. A schema that is invalid stops the run before any request.

## Data source and its limits

- **Source: AgentFeed, our own data service.** It fetches the one URL you supply, once, on your request, and has a language model (currently Gemini 3.1 Flash-Lite) read it against your schema. The document is not stored.
- **One URL, one result.** It reads the page you give it and does not crawl links or follow pagination.
- **Plain fetch, no browser.** Only http and https links on ports 80 and 443 are fetched, redirects are followed, as HTML or PDF. Content a site builds only with JavaScript after the page loads may be missing, and pages behind a login or a bot wall cannot be read.
- **Up to 10 MB per document, and about the first 20,000 tokens are read.** `truncated` and `pct_read` say how much.
- **robots.txt is honoured.** If the site forbids automated fetching, the link returns nothing.
- **Private, local and reserved addresses are refused.**
- **A model reads the page, so check the values that matter.** `verbatim_fields` lists the values found word for word in the text; a value you need exact should be one of them, or checked against the page.
- The content belongs to its publisher, and you are responsible for how you use it.

## Source code

[github.com/seekdaseek/agentfeed-apify/tree/main/ai-data-extractor](https://github.com/seekdaseek/agentfeed-apify/tree/main/ai-data-extractor) (MIT).
