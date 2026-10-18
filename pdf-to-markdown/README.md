# PDF to Markdown: clean text from any PDF URL

**Turn PDF links into clean markdown text, page by page, with the page count, the word count and the file size. One JSON item per PDF, ready for search, summarising, RAG pipelines or LLM prompts.**

Paste a list of public PDF URLs. The actor fetches each file once, extracts its text layer and returns it as markdown, with every page under its own heading (`## Page 1`, `## Page 2`, and so on). No file upload, no browser, no setup.

## What you get, per PDF

- **markdown:** the text of the PDF, page by page, each page under a `## Page N` heading.
- **pages**, **words** (words of the text itself, not counting the page headings) and **bytes** (file size).
- **title** from the PDF's metadata, when the file has one.
- **truncated:** `false` when the markdown holds the whole text, `true` when the text was longer than 300,000 characters and was cut.
- **url** (what you supplied), **final_url** (after redirects), `rights`, `source` and `fetched_at`.

## Use cases

- Feed reports, papers, filings or manuals to an LLM or a RAG pipeline as plain text.
- Index or search a set of PDFs without running your own parser.
- Pull the text of a list of PDF links on an Apify schedule and export it as JSON, CSV or Excel.
- Check how long a PDF is (pages, words) before you decide to process it further.

## Input

| Field | Type | Default | Description |
|---|---|---|---|
| `urls` | array of strings | prefill `["https://bitcoin.org/bitcoin.pdf"]` | Public http or https links to PDF files (up to 50). |

With no input at all, the actor converts that one example PDF, so the default run always returns data.

## How to run it

**In the Apify Console:** open the Actor, paste the PDF links into the Input tab and click Start. The dataset has an **Overview** table (one row per PDF, without the full text) and can be exported as JSON, CSV or Excel; the markdown is in each item.

**Through the API:** one request starts a run and returns the items (replace `YOUR_API_TOKEN` with your Apify API token):

```bash
curl -X POST "https://api.apify.com/v2/acts/ochinimus~pdf-to-markdown/run-sync-get-dataset-items" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://bitcoin.org/bitcoin.pdf"]}'
```

The answer is a JSON array with one item per PDF that converted. See the Apify API docs for asynchronous runs and schedules.

## Sample output

A real result for the example PDF, captured live on 14 Oct 2026. The `markdown` field is shortened for this page; the real one holds the whole text.

```json
{
  "url": "https://bitcoin.org/bitcoin.pdf",
  "final_url": "https://bitcoin.org/bitcoin.pdf",
  "title": null,
  "pages": 9,
  "words": 3559,
  "bytes": 184292,
  "truncated": false,
  "markdown": "## Page 1\n\nBitcoin: A Peer-to-Peer Electronic Cash System\nSatoshi Nakamoto\nsatoshin@gmx.com\nwww.bitcoin.org\nAbstract. A purely peer-to-peer version of electronic cash would allow online\npayments to be sent directly from one party to another without going through a\nfinancial institution. Digital signatures provide part of the solution, but the main\nbenefits are lost if a trusted third party is still required to ...",
  "rights": "fetched once from the URL you supplied, on your request, and not stored; the content belongs to its publisher and you are responsible for your use of it",
  "source": "AgentFeed, PDF fetched once from the URL you supplied",
  "fetched_at": "2026-10-14T15:35:50.423Z"
}
```

## Pricing

Pay per event: **$0.01 per PDF converted** (event `pdf`), plus Apify's tiny per-run start fee.

You are charged only for PDFs that come back with text. A link that cannot be fetched, a file that is not a PDF, a private or blocked address, a site whose robots.txt forbids it, a PDF with no text, and any data-source error return nothing and cost nothing.

## Data source and its limits

- **Source: AgentFeed, our own data service.** It fetches the one URL you supply, once, on your request, extracts the text and does not store it.
- **Only PDFs with a text layer convert.** A scanned PDF that is only page images is not OCRed: it returns nothing and costs nothing.
- **Limits per file:** 10 MB, and 10 seconds to fetch. Only http and https links on ports 80 and 443 are fetched, up to 3 redirects.
- **robots.txt is honoured.** If the site forbids automated fetching, the link returns nothing.
- **Private, local and reserved addresses are refused.**
- **Text is cut at 300,000 characters per PDF** (`truncated` tells you).
- Text comes out as the PDF's text layer provides it: multi-column pages, tables and footnotes may not read in order. Images are not described.
- The PDF's content belongs to its publisher, and you are responsible for how you use it.

## Source code

[github.com/seekdaseek/agentfeed-apify/tree/main/pdf-to-markdown](https://github.com/seekdaseek/agentfeed-apify/tree/main/pdf-to-markdown) (MIT).
