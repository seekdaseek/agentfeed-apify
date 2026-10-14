# Scholarly Paper Search: OpenAlex, Google Scholar alternative

**Search scholarly papers by topic and look up papers by DOI. Every result is one clean JSON item: title, year, DOI, authors, venue, citation count and a link to a free copy when one exists. The data comes from OpenAlex's open CC0 dataset, not from scraping Google Scholar.**

OpenAlex is an open catalogue of scholarly works. This actor puts it behind two simple inputs, a list of search queries and a list of DOIs, and returns one dataset item per paper. Nothing is scraped, nothing needs a proxy, and there is no browser to break.

## What you get, per paper

- **Title, year, DOI** and the **OpenAlex ID** of the work.
- **Authors:** up to 25 names in OpenAlex's order, plus the total number of authors.
- **Venue** (journal, conference or repository) and the work **type** (article, review, preprint and so on).
- **Citation count** as OpenAlex counts it.
- **Open access:** whether OpenAlex knows a free-to-read copy, and the link to it.
- **Abstract** for DOI lookups, where OpenAlex holds one (up to 4,000 characters).
- `query` (the search that found the paper; empty for a DOI lookup), `source`, `license` (CC0) and `fetched_at` on every item.

## Use cases

- Scan the literature on a topic: run a few queries and get the most relevant papers, up to 25 per query.
- Enrich a reading list or bibliography: paste DOIs and get titles, authors, venues, citation counts and abstracts back.
- Track how often a set of papers is cited: run the DOI list on an Apify schedule (the data behind it is cached for 24 hours, so counts move at most daily).
- Find a free-to-read copy of a paper through the open-access link.
- Feed an agent, a RAG pipeline or a spreadsheet with paper metadata, and export the results as JSON, CSV or Excel.

## Input

| Field | Type | Default | Description |
|---|---|---|---|
| `queries` | array of strings | prefill `["large language models"]` | Topics to search, one search each (up to 200 characters, up to 20 queries). Every paper found is one result. |
| `dois` | array of strings | prefill `["10.1038/nature14539"]` | DOIs to look up (up to 50). `10.1038/nature14539` and `https://doi.org/10.1038/nature14539` both work. |
| `year_from` | integer | none | Only papers from this year on, for the searches. Does not apply to DOI lookups. |
| `max_results_per_query` | integer | `10` | Papers per search, 1 to 25. |

With no input at all, the actor runs one search and one DOI lookup, so the default run always returns data.

## How to run it

**In the Apify Console:** open the Actor, enter queries and or DOIs in the Input tab and click Start. The dataset has an **Overview** table (one row per paper) and can be exported as JSON, CSV or Excel.

**Through the API:** one request starts a run and returns the items (replace `YOUR_API_TOKEN` with your Apify API token):

```bash
curl -X POST "https://api.apify.com/v2/acts/ochinimus~scholarly-paper-search/run-sync-get-dataset-items" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"queries": ["graph neural networks"], "max_results_per_query": 5}'
```

The answer is a JSON array with one item per paper. See the Apify API docs for asynchronous runs and schedules.

## Sample output

Two real results, captured live on 14 Oct 2026 and shortened for this page (author lists cut to three names). The first came from a search, the second from a DOI lookup.

```json
[
  {
    "query": "large language models",
    "title": "Large language models in medicine",
    "year": 2023,
    "doi": "10.1038/s41591-023-02448-8",
    "authors": [
      "Arun James Thirunavukarasu",
      "Darren Shu Jeng Ting",
      "Kabilan Elangovan"
    ],
    "authors_total": 6,
    "venue": "Nature Medicine",
    "type": "article",
    "cited_by_count": 3802,
    "is_open_access": true,
    "open_access_url": "https://www.repository.cam.ac.uk/handle/1810/349830",
    "abstract": null,
    "openalex_id": "https://openalex.org/W4384561707",
    "source": "OpenAlex (openalex.org), via AgentFeed (x402.ochinimus.app)",
    "license": "CC0",
    "fetched_at": "2026-10-14T15:25:31.607Z"
  },
  {
    "query": null,
    "title": "Deep learning",
    "year": 2015,
    "doi": "10.1038/nature14539",
    "authors": [
      "Yann LeCun",
      "Yoshua Bengio",
      "Geoffrey E. Hinton"
    ],
    "authors_total": 3,
    "venue": "Nature",
    "type": "article",
    "cited_by_count": 83602,
    "is_open_access": true,
    "open_access_url": "https://hal.science/hal-04206682",
    "abstract": null,
    "openalex_id": "https://openalex.org/W2919115771",
    "source": "OpenAlex (openalex.org), via AgentFeed (x402.ochinimus.app)",
    "license": "CC0",
    "fetched_at": "2026-10-14T15:25:31.721Z"
  }
]
```

## Pricing

Pay per event: **$0.003 per paper returned** (event `paper`), plus Apify's tiny per-run start fee.

You are charged only for papers that come back. A search with no hits, a DOI OpenAlex does not know, an input that is not a DOI, and any data-source error return nothing and cost nothing.

## Data source and its limits

- **Source: OpenAlex (openalex.org), through AgentFeed (x402.ochinimus.app).** OpenAlex's data is released under CC0, the public domain, so you may use and redistribute it freely.
- **This is not Google Scholar.** It does not scrape Google Scholar and is not affiliated with it. Coverage, ranking and citation counts are OpenAlex's and will differ from Google Scholar's.
- **Searches return up to 25 papers each** and carry no abstract. Abstracts come with DOI lookups, and only where OpenAlex holds one.
- **Cached for 24 hours:** repeating the same search within a day returns the same answer.
- **A daily search allowance is shared.** OpenAlex's free allowance is limited, so searches that reach OpenAlex are capped at 90 per UTC day across everyone who uses this data source. When it is used up, the searches in your run are skipped with the reason in the log, cost nothing, and work again after 00:00 UTC. DOI lookups are not capped.
- Author lists are cut at 25 names (`authors_total` has the full count).
- This is data, not advice, and you are responsible for how you use it.

## Built for agents too

The same data is sold per call to AI agents over the x402 protocol (USDC, no account): [x402.ochinimus.app](https://x402.ochinimus.app), routes `/api/papers` and `/api/paper/{doi}`, OpenAPI at [x402.ochinimus.app/openapi.json](https://x402.ochinimus.app/openapi.json).

Source code: [github.com/seekdaseek/agentfeed-apify](https://github.com/seekdaseek/agentfeed-apify) (MIT), folder `scholarly-paper-search`.
