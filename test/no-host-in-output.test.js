import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SOURCE as map } from '../liquidation-map/src/map.js';
import { SOURCE as pdf } from '../pdf-to-markdown/src/map.js';
import { SOURCE as papers } from '../scholarly-paper-search/src/map.js';
import { SOURCE as extractor } from '../ai-data-extractor/src/map.js';
import { SOURCE as calendar } from '../us-macro-calendar/src/map.js';

// The `source` field is in every row a user exports from the Store, so it must name the origin of the data and not our API host.
const HOST = /ochinimus\.app|x402/i;

test('the source line of every actor that sets one names the data origin and not our API host', () => {
    for (const s of [map, pdf, papers, extractor, calendar]) {
        assert.equal(typeof s, 'string');
        assert.doesNotMatch(s, HOST);
        assert.match(s, /AgentFeed/);
    }
    assert.match(map, /Hyperliquid/);
    assert.match(papers, /OpenAlex/);
    assert.match(calendar, /Federal Reserve, BLS and BEA/);
});

test('control: the host check can fail (the old source line is caught)', () => {
    assert.match('AgentFeed (x402.ochinimus.app), Hyperliquid on-chain positions', HOST);
});

test('no README or committed example output carries the host', () => {
    const files = ['liquidation-map/README.md', 'liquidation-map/examples/BTC.json', 'pdf-to-markdown/README.md', 'pdf-to-markdown/examples/bitcoin-pdf-item.json', 'scholarly-paper-search/README.md', 'scholarly-paper-search/examples/doi-item.json', 'scholarly-paper-search/examples/search-item.json', 'us-company-filings/README.md', 'ai-data-extractor/README.md', 'ai-data-extractor/examples/solana-wikipedia-item.json', 'us-macro-calendar/README.md', 'us-macro-calendar/examples/fomc-item.json', 'email-list-cleaner/README.md'];
    for (const f of files) assert.doesNotMatch(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), HOST, f);
});
