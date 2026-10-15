import Ajv from 'ajv';
import fs from 'node:fs';
import { schemaChecks } from '../../shared/schema-checks.js';
import { mapExtract } from '../src/map.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const T = '2026-10-15T10:30:00.000Z';
const items = [
    ...mapExtract('https://en.wikipedia.org/wiki/Solana_(blockchain_platform)', fx('wikipedia-solana.json'), T),
    ...mapExtract('https://bitcoin.org/bitcoin.pdf', fx('bitcoin-pdf.json'), T),
];
const [nullItem] = mapExtract('https://a.test/x', { data: { data: { a: 'x', b: null }, final_url: 7, kind: 3, title: 5, null_fields: 'b', verbatim_fields: [1, 'a'], truncated: 'maybe', pct_read: 'all' } }, T);

schemaChecks({ actorDir: new URL('..', import.meta.url), Ajv, items, nullItem, expectedViews: ['overview'], minProperties: 13, uniqueTitles: true });
