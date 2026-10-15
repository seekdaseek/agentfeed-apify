# Data sources and licences

Everything the actor checks against is listed here. Nothing is copied from a source without a licence that allows it.

## Third-party data

| What | Source | Licence | Version in this build |
|---|---|---|---|
| Disposable and throwaway mail domains, `data/disposable-domains.txt` (9,892 domains) | [disposable-email-domains/disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains), file `disposable_email_blocklist.conf` | **CC0 1.0** (public domain dedication; the project's README says the work may be copied, modified, distributed and used "even for commercial purposes, all without asking permission") | commit `29463cf9d049e800f04147e643ad76c7203def96` of 2026-10-15; SHA-256 of the snapshot `5052d5eebd1b8907738dbbf3f1f4cd961593c14f44435674bc6d8a34986009a7` |
| DNS over HTTPS fallback | Cloudflare's public DNS JSON API (`cloudflare-dns.com/dns-query`), used only when the platform's resolver does not answer | a public service, not copied data | n/a |

## Our own lists (MIT, written for this actor)

`src/lists.js`: role-account names, free mailbox providers, the popular domains a typo is measured against, named domain typos, mistyped top-level domains, asset file extensions, error-tracking hosts, placeholder domains, and the MX host patterns that name a mail provider. The placeholder reserved names follow RFC 2606 and RFC 6761; the rest are plain facts about well-known services.

## Standards the checks follow

RFC 5321 (the A-record fallback when a domain has no MX, section 5.1), RFC 7505 (null MX), RFC 2606 and RFC 6761 (reserved names).

## Refreshing

The disposable list is a snapshot taken at build time. To refresh it: download the file again from the source above, replace `data/disposable-domains.txt`, update the commit, date and SHA-256 in this file, run `npm test`, and push a new build.
