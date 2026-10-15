import Ajv from 'ajv';
import fs from 'node:fs';
import { schemaChecks } from '../../shared/schema-checks.js';
import { mapCalendar } from '../src/map.js';

const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const T = '2026-10-15T10:30:00.000Z';
const items = mapCalendar(['FOMC', 'CPI', 'NFP', 'PCE'], fx('calendar-90-days.json'), T);
const [nullItem] = mapCalendar(['FOMC'], { data: { events: [{ type: 'FOMC', title: 5, reference_period: 3, date_new_york: '2026-10-28', time_new_york: 9, utc: '2026-10-28T18:00:00.000Z', press_conference: 'yes', source_url: 1, verified_at: 2 }], next: [] } }, T);

schemaChecks({ actorDir: new URL('..', import.meta.url), Ajv, items, nullItem, expectedViews: ['overview'], minProperties: 14, uniqueTitles: true });
