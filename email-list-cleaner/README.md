# Email Cleaner: fix, dedupe and check scraped emails (no SMTP)

**Cleans the email list a scraper left behind. It fixes the leftovers around an address, drops the junk that is not an address at all, removes duplicates, and checks each domain with DNS: does it take mail, is it disposable, is the address a role account, is the domain a typo. It does not check that a mailbox exists: there is no SMTP probe, and the actor never says an address is "deliverable".**

Point it at the output of a contact, Google Maps or website email scraper, or paste a list. One result per unique address, in input order, with a status, the reasons and the checks behind it.

## What it does not do, and why

- **No mailbox check.** It does not connect to the recipient's mail server (SMTP). Outbound port 25 is blocked on the Apify platform: connections to the mail servers of Gmail, Outlook, Yahoo, iCloud and Proton on port 25 time out from an Actor, while port 443 connects normally (measured on 15 Oct 2026). A mailbox check from here would be a guess, so the actor does not make one.
- **No "deliverable" and no "verified".** `valid` means: the domain takes mail and nothing about the address looks wrong. A `valid` address can still bounce.
- **No catch-all test.** A catch-all domain accepts every address, which only an SMTP probe can detect. The `mx_provider` field names who runs the mail (Google, Microsoft 365, Zoho, Proofpoint, Mimecast and more) so you can reason about it yourself.
- **If you need mailbox-level answers:** run the `valid` and `risky` results through an SMTP verifier. This actor removes the junk, the duplicates and the dead domains first, so you pay the SMTP verifier for far fewer addresses.

## What it cleans, in order

1. **Fixes the leftovers.** `mailto:` prefixes and their `?subject=` part, `%20` and other percent-encoding, the JSON remnants `u003e` and `u003c`, quotes, angle brackets, brackets, trailing punctuation, invisible characters, and the address inside `Name <name@site.com>`. The domain is lower-cased (the part before the `@` keeps its case) and an international domain becomes its ASCII form. The raw line stays in `input`; `fixed_from` holds it when cleaning changed something.
2. **Drops junk that is not an address.** `file_name`: asset names read as addresses (`logo@2x.png`, `icon@3x.jpg`), version strings and paths (`bootstrap@5.2.3`). `tracking_id`: machine ids at error-tracking hosts (`5f3a...@sentry.wixpress.com`, `...@sentry.io`) and local parts of 28 or more hex characters or a UUID. `placeholder`: fill-in addresses (`name@example.com`, `you@domain.com`, `.test` and `.invalid` names). These are `invalid` and cost no DNS lookup.
3. **Removes duplicates** (case-insensitive, after step 1), within the run and across the whole list.
4. **Looks up each domain once** (cached), a bounded number at a time: MX first; a null MX (RFC 7505) is `invalid`; no MX falls back to an A or AAAA record (RFC 5321 section 5.1) and is `risky`; a domain that does not exist is `invalid`.
5. **Flags** a disposable domain (public list, parent domains included), a role account (`info@`, `sales@`, `support@`, `noreply@`, `info.chicago@`), a free provider, a likely typo (`gmai.com`, `gmail.con`) with a suggested fix in `did_you_mean`, and a non-ASCII local part.

## Statuses

| Status | Meaning | Charged |
|---|---|---|
| `valid` | The domain takes mail and nothing about the address looks wrong. | yes |
| `risky` | The domain takes mail, but the address is disposable, a role account, a likely typo, or reachable only through an A record. | yes |
| `invalid` | Bad syntax, junk, a domain that does not exist, a null MX, or a domain with no mail host. | yes |
| `unknown` | The DNS lookup did not finish (timeout or a server failure). Run it again. | **no** |

A line with no `@` at all is returned as `invalid` with the reason `not_an_email` and is not charged.

Reasons: `invalid_syntax`, `not_an_email`, `junk_file_name`, `junk_tracking_id`, `junk_placeholder`, `domain_not_found`, `null_mx`, `no_mail_host`, `a_record_fallback`, `disposable`, `role_account`, `did_you_mean`, `non_ascii_local_part`, `dns_timeout`, `dns_error`.

## Input

| Field | Type | Default | Description |
|---|---|---|---|
| `emails` | array of strings | prefill: a 10-line sample | The addresses, one per line, as the scraper gave them (up to 200,000 lines in total). |
| `datasetId` | dataset | none | A dataset from another Actor. Pick it in the Console, or pass its id through the API; the run gets read access to that one dataset. Can be used together with `emails`. |
| `field` | string | `email` | The field that holds the address in each dataset item. A dotted path (`contact.email`) works, and a field that holds a list of addresses (or `a@x.com; b@y.com`) is read one by one. |
| `dedupe` | boolean | `true` | On: a repeated address is dropped from the output. Off: every line is returned, a repeat copies the first verdict and names it in `duplicate_of`. A repeat is never charged either way. |

With no input at all the actor runs the 10-line sample, so the default run always returns data. Values that are not text are skipped and counted; if no line contains an `@` the run stops with a clear message before any lookup. Your maximum charge per run is respected: the run stops cleanly and keeps the rows already returned.

## Output (one item per unique address)

| Field | Meaning |
|---|---|
| `input` | The line exactly as it came in. |
| `email` | The cleaned address (empty when the line has no `@`). |
| `status`, `reasons` | The verdict and why. |
| `fixed_from` | The raw line, when cleaning changed it. |
| `junk` | `file_name`, `tracking_id` or `placeholder`, else empty. |
| `domain` | The domain, lower case, ASCII form. |
| `accepts_mail`, `mx_null` | Whether the domain has a mail server (or an address record to fall back on); whether it publishes a null MX. |
| `mx_provider` | `google`, `microsoft`, `zoho`, `proofpoint`, `mimecast`, `yahoo`, `icloud`, `proton`, `fastmail` and more; `other` for an MX we do not know; `none` when there is no MX. |
| `disposable`, `role`, `free_provider` | The list-based flags. |
| `did_you_mean` | A corrected address when the domain looks like a typo. |
| `duplicate_of` | With `dedupe` off: the first input line that held the same address. |

The dataset has an **Overview** table. A summary of the run (counts by status, duplicates, charged rows, which DNS path answered) is saved in the key-value store under `SUMMARY`.

## How to run it

**In the Apify Console:** paste the addresses, or pick the dataset of a scraper run, and click Start.

**After another Actor, through the API** (replace `YOUR_API_TOKEN` and the dataset id):

```bash
curl -X POST "https://api.apify.com/v2/acts/ochinimus~email-list-cleaner/run-sync-get-dataset-items" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"datasetId": "SCRAPER_RUN_DEFAULT_DATASET_ID", "field": "email"}'
```

## Sample output

Real results for three lines of the default sample, from a run on the Apify platform on 15 Oct 2026:

```json
[
  {
    "input": "Jane.Doe@Gmail.COM",
    "email": "Jane.Doe@gmail.com",
    "status": "valid",
    "reasons": [],
    "fixed_from": "Jane.Doe@Gmail.COM",
    "junk": null,
    "domain": "gmail.com",
    "accepts_mail": true,
    "mx_null": false,
    "mx_provider": "google",
    "disposable": false,
    "role": false,
    "free_provider": true,
    "did_you_mean": null,
    "duplicate_of": null
  },
  {
    "input": "logo@2x.png",
    "email": "logo@2x.png",
    "status": "invalid",
    "reasons": [
      "junk_file_name"
    ],
    "fixed_from": null,
    "junk": "file_name",
    "domain": "2x.png",
    "accepts_mail": null,
    "mx_null": false,
    "mx_provider": null,
    "disposable": false,
    "role": false,
    "free_provider": false,
    "did_you_mean": null,
    "duplicate_of": null
  },
  {
    "input": "john@gmai.com",
    "email": "john@gmai.com",
    "status": "risky",
    "reasons": [
      "did_you_mean"
    ],
    "fixed_from": null,
    "junk": null,
    "domain": "gmai.com",
    "accepts_mail": true,
    "mx_null": false,
    "mx_provider": "other",
    "disposable": false,
    "role": false,
    "free_provider": false,
    "did_you_mean": "john@gmail.com",
    "duplicate_of": null
  }
]
```

## Pricing

Pay per event: **$0.30 per 1,000 checked emails** ($0.0003 each, event `checked-email`), plus Apify's start fee of $0.00005 per run.

Charged: one event per **unique** address that got a verdict (`valid`, `risky` or `invalid`). **Free:** a repeated address, an `unknown` (the lookup did not finish), a line that is not an address, a blank line, and a run that stops on bad input (a dataset that cannot be read, no `@` anywhere, an invalid field name).

## Limits and data

- One DNS lookup per domain, cached for the run; 4 s per lookup with the system resolver. If the platform's resolver stops answering, the actor switches to DNS over HTTPS (port 443) and the summary records which path answered.
- The disposable-domain list is a snapshot (see `SOURCES.md` for its source, licence and date) and the other lists are our own; a new throwaway service can be missing until the list is refreshed.
- `role`, `disposable` and typo flags are rules, not certainty: `risky` means "look at this one", not "will bounce".
- Up to 200,000 lines per run; 256 MB of memory.

## Built for agents too

The same domain-level checks are sold per call to AI agents over the x402 protocol (USDC, no account) at [x402.ochinimus.app](https://x402.ochinimus.app), route `/api/email-verify`.

Source code: [github.com/seekdaseek/agentfeed-apify](https://github.com/seekdaseek/agentfeed-apify) (MIT), folder `email-list-cleaner`. Data sources and licences: `SOURCES.md`.
