import Ajv from 'ajv';
import fs from 'node:fs';
import { schemaChecks } from '../../shared/schema-checks.js';
import { mapPdf } from '../src/map.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const T = '2026-10-14T15:45:00.000Z';
const items = [...mapPdf('https://bitcoin.org/bitcoin.pdf', fx('bitcoin-pdf.json'), T), ...mapPdf('https://a.test/x.pdf', { data: { ...fx('bitcoin-pdf.json').data, truncated: true, title: 'A title' } }, T)];
const [nullItem] = mapPdf('https://a.test/x.pdf', { data: { markdown: 'a b c', title: 5, pages: 'x', bytes: null, final_url: 7, rights: 1, truncated: 'maybe' } }, T);

schemaChecks({ actorDir: new URL('..', import.meta.url), Ajv, items, nullItem, expectedViews: ['overview'], minProperties: 11 });
