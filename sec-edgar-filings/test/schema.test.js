import Ajv from 'ajv';
import fs from 'node:fs';
import { schemaChecks } from '../../shared/schema-checks.js';
import { mapFilings } from '../src/map.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const T = '2026-10-14T15:40:00.000Z';
const items = [...mapFilings('AAPL', fx('aapl-any.json'), T), ...mapFilings('AAPL', fx('aapl-8k.json'), T), ...mapFilings('BRK-B', fx('brkb.json'), T)];
const [nullItem] = mapFilings('X', { data: { ticker: 5, company: null, cik: 3, filings: [{ accession: 'a', form: 5, filed: null, report_date: 7, description: [], items: {}, document_url: null, index_url: 1 }] } }, T);

schemaChecks({ actorDir: new URL('..', import.meta.url), Ajv, items, nullItem, expectedViews: ['overview'], minProperties: 13 });
