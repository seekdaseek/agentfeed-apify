// The cleaning pipeline, without the Apify SDK: a batch of raw strings in, verdict records out, in input order.
// `lookup(domain)` is injected (the real one is in dns.js), so the same code runs against a fake resolver in tests.
import { classifyJunk, isCharged, judge, normalizeEmail, validSyntax } from './core.js';
import { mapLimit } from './dns.js';

export const newCounters = () => ({ lines: 0, blank: 0, rejected: 0, unique: 0, valid: 0, invalid: 0, risky: 0, unknown: 0, not_an_email: 0, duplicates: 0, charged: 0, fixed: 0, junk: 0 });

/**
 * One cleaner per run. `process(batch)` takes an array of raw values and returns [{ record, charged }] for the lines that
 * produce output, in input order. With dedupe on, a repeat of an address already seen (in this batch or an earlier one) produces
 * no line at all; with dedupe off it produces a line that copies the first verdict, names the first input in `duplicate_of`,
 * and is never charged. Blank lines and values that are not text are skipped and counted.
 */
export function createCleaner({ lookup, disposableSet, dedupe = true, concurrency = 32 }) {
    const counters = newCounters();
    const seen = new Map(); // normalised lower-case address -> first record (kept only when dedupe is off) or true
    const domains = new Map(); // domain -> Promise of the DNS answer

    const dnsFor = (domain) => {
        if (!domains.has(domain)) domains.set(domain, lookup(domain));
        return domains.get(domain);
    };

    async function process(batch) {
        const plan = [];
        for (const raw of batch) {
            if (typeof raw !== 'string') { counters.rejected++; continue; }
            if (raw.trim() === '') { counters.blank++; continue; }
            counters.lines++;
            const norm = normalizeEmail(raw);
            const key = norm.email ? norm.email.toLowerCase() : null;
            if (key && seen.has(key)) {
                counters.duplicates++;
                if (!dedupe) plan.push({ raw, norm, dupOf: key });
                continue;
            }
            if (key) seen.set(key, true);
            plan.push({ raw, norm, key });
        }
        // one lookup per domain, only for addresses that passed the syntax and junk tests
        const needed = [];
        const want = new Set();
        for (const p of plan) {
            if (p.dupOf || !p.norm.emailLike || !validSyntax(p.norm.local, p.norm.domain) || classifyJunk(p.norm.local, p.norm.domain)) continue;
            if (!want.has(p.norm.domain)) { want.add(p.norm.domain); needed.push(p.norm.domain); }
        }
        await mapLimit(needed, concurrency, dnsFor);
        const out = [];
        const records = new Map();
        for (const p of plan) {
            if (p.dupOf) {
                const first = records.get(p.dupOf) ?? seen.get(p.dupOf);
                if (first && first !== true) out.push({ record: { ...first, input: p.raw, fixed_from: p.norm.fixedFrom, duplicate_of: first.input }, charged: false });
                continue;
            }
            const dns = want.has(p.norm.domain) ? await dnsFor(p.norm.domain) : null;
            const record = judge(p.norm, dns, { disposableSet });
            if (p.key) { records.set(p.key, record); if (!dedupe) seen.set(p.key, record); }
            counters.unique++;
            counters[record.status]++;
            if (record.reasons.includes('not_an_email')) counters.not_an_email++;
            if (record.junk) counters.junk++;
            if (record.fixed_from) counters.fixed++;
            const charged = isCharged(record);
            if (charged) counters.charged++;
            out.push({ record, charged });
        }
        return out;
    }

    return { process, counters, domainCount: () => domains.size };
}

export const newReturned = () => ({ rows: 0, charged: 0, valid: 0, risky: 0, invalid: 0, unknown: 0, not_an_email: 0 });

/**
 * Counts what a push really delivered. A charged push is written short when the run's maximum charge is reached: `written` is how
 * many of the rows went in (the first ones), the rest were never written, so they are not counted.
 */
export function tallyReturned(returned, rows, charged, written) {
    const n = charged ? Math.min(rows.length, Number.isFinite(written) ? written : rows.length) : rows.length;
    for (const r of rows.slice(0, n)) {
        returned.rows++;
        returned[r.status]++;
        if (r.reasons.includes('not_an_email')) returned.not_an_email++;
    }
    if (charged) returned.charged += n;
    return n;
}
