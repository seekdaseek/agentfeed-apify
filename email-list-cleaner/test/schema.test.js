import Ajv from 'ajv';
import { schemaChecks } from '../../shared/schema-checks.js';
import { createCleaner } from '../src/clean.js';
import { judge, normalizeEmail } from '../src/core.js';
import { SAMPLE_EMAILS } from '../src/plan.js';

const MX = { kind: 'mx', hosts: [{ exchange: 'mx.example-host.net', priority: 10 }] };
const lookup = async (d) => (d === 'this-domain-does-not-exist-af.com' ? { kind: 'nxdomain' } : d === 'gmial.com' ? { kind: 'a_fallback' } : MX);
const cleaner = createCleaner({ lookup, disposableSet: new Set(['mailinator.com']), dedupe: false });
const items = (await cleaner.process([...SAMPLE_EMAILS, 'x@slow.com', 'hello world'])).map((e) => e.record);
const nullItem = judge(normalizeEmail('​ <@>'), null, { disposableSet: new Set() });

schemaChecks({ actorDir: new URL('..', import.meta.url), Ajv, items, nullItem, expectedViews: ['overview'], minProperties: 15, uniqueTitles: true, usesAgentFeedKey: false });
