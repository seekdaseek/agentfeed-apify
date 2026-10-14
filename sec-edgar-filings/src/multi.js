// Collection loop for actors where ONE AgentFeed request yields zero to many dataset items (a search, a filing list) or
// where a job may legitimately hold nothing worth selling. Copied byte-for-byte into the actors that use it, next to
// agentfeed.js (which it imports); test/shared.test.js fails if a copy drifts. Edit shared/ and run `npm run sync`.
import { AUTH_STATUSES } from './agentfeed.js';

/**
 * Walks `jobs` in order, ONE at a time (the box that answers has little memory, so never in parallel).
 * For each job: request(job) -> toItems(job, body) -> push(items). push() must return the SDK's ChargeResult (or undefined).
 * A failed request, or a response that maps to no items, pushes NOTHING and so charges nothing; it is logged with its
 * reason and the loop moves on. Only a rejected key (401/402/403) stops the loop. eventChargeLimitReached ends it
 * because the user's spending cap is hit; the SDK has already trimmed the pushed items to what the cap allows.
 */
export async function collectMany({ jobs, request, toItems, push, log, label = (job) => String(job?.name ?? job) }) {
    const stats = { jobs: 0, pushed: 0, failed: 0, empty: 0, authFailed: false, limitReached: false };
    for (const job of jobs) {
        stats.jobs++;
        const res = await request(job);
        if (!res.ok) {
            if (AUTH_STATUSES.has(res.status)) {
                stats.authFailed = true;
                log.error(`${label(job)}: AgentFeed refused the actor's key (${res.reason}); stopping, nothing charged for this input`);
                break;
            }
            stats.failed++;
            log.warning(`${label(job)}: ${res.reason}; no item pushed, nothing charged`);
            continue;
        }
        let items = [];
        try {
            const mapped = toItems(job, res.body);
            items = (Array.isArray(mapped) ? mapped : [mapped]).filter(Boolean);
        } catch (err) {
            log.warning(`${label(job)}: could not read the response (${err?.message}); no item pushed, nothing charged`);
        }
        if (items.length === 0) {
            stats.empty++;
            log.warning(`${label(job)}: nothing to return for this input; no item pushed, nothing charged`);
            continue;
        }
        const charge = await push(items);
        stats.pushed += items.length;
        if (charge?.eventChargeLimitReached) {
            stats.limitReached = true;
            log.warning('The run reached its maximum charge; stopping.');
            break;
        }
    }
    return stats;
}

/** Trims, collapses whitespace, drops blanks and case-insensitive duplicates. Returns { valid, rejected }; `normalize` may throw or return null to reject. */
export function cleanList(raw, { normalize = (s) => s, max = 50, fallback = [] } = {}) {
    const list = Array.isArray(raw) && raw.length > 0 ? raw : fallback;
    const valid = [];
    const seen = new Set();
    const rejected = [];
    for (const entry of list) {
        const text = String(entry ?? '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        let value = null;
        try { value = normalize(text); } catch { value = null; }
        if (!value) { rejected.push(text.slice(0, 60)); continue; }
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (valid.length < max) valid.push(value);
        else rejected.push(`${text.slice(0, 40)} (over the limit of ${max})`);
    }
    return { valid, rejected };
}
