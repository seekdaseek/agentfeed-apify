import Ajv from 'ajv';
import fs from 'node:fs';
import { schemaChecks } from '../../shared/schema-checks.js';
import { mapDoi, mapSearch } from '../src/map.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const T = '2026-10-14T15:30:00.000Z';
const search = mapSearch('large language models', fx('papers-search.json'), T);
const dois = [...mapDoi('10.1038/nature14539', fx('paper-doi-nature14539.json'), T), ...mapDoi('10.48550/arxiv.1706.03762', fx('paper-doi-with-abstract.json'), T)];
const [nullItem] = mapSearch('q', { data: { papers: [{ title: 'T', year: 'x', doi: null, authors: [1], authors_total: 'x', venue: 5, cited_by: 'x', open_access: null, openalex_id: undefined }] } }, T);

schemaChecks({ actorDir: new URL('..', import.meta.url), Ajv, items: [...search, ...dois], nullItem, expectedViews: ['overview'], minProperties: 16 });
