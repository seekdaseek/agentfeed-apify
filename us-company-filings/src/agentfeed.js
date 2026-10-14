// AgentFeed client and collection loop. This file is copied byte-for-byte into each actor's src/ (an Apify build
// only sees its own actor folder); test/shared.test.js at the repo root fails if a copy drifts. Edit shared/ and run
// `npm run sync`, never an actor's copy.

export const AGENTFEED_BASE = 'https://x402.ochinimus.app';

// A key that is wrong, empty or out of balance answers one of these on every call, so there is no point continuing.
export const AUTH_STATUSES = new Set([401, 402, 403]);

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One GET against AgentFeed with the actor's key. Never throws and never puts the key anywhere but the header.
 * Answers { ok: true, body } for a 200 with a JSON body, otherwise { ok: false, status, reason } (status 0 = no response).
 * A 429 (key rate limit, 120/min) is retried once after Retry-After, capped at 10 s.
 */
export async function getAgentFeed(path, params, { key, fetchFn = globalThis.fetch, baseUrl = AGENTFEED_BASE, timeoutMs = 30000, sleep = sleepMs } = {}) {
    const url = new URL(path, baseUrl);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
    for (let attempt = 0; attempt < 2; attempt++) {
        let res;
        try {
            res = await fetchFn(url, {
                headers: { 'X-AgentFeed-Key': key, Accept: 'application/json', 'User-Agent': 'agentfeed-apify/1.0 (+https://x402.ochinimus.app)' },
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (err) {
            return { ok: false, status: 0, reason: `no response (${err?.name || 'error'})` };
        }
        if (res.status === 429 && attempt === 0) {
            const wait = Math.min(Math.max(Number(res.headers.get('retry-after')) || 2, 1), 10);
            await sleep(wait * 1000);
            continue;
        }
        if (res.status !== 200) {
            let reason = `HTTP ${res.status}`;
            try {
                const text = (await res.text()).slice(0, 300);
                const parsed = JSON.parse(text);
                if (parsed && typeof parsed.error === 'string') reason = `${reason}: ${parsed.error.slice(0, 160)}`;
            } catch { /* not JSON: keep the bare status */ }
            return { ok: false, status: res.status, reason };
        }
        try {
            return { ok: true, body: await res.json() };
        } catch {
            return { ok: false, status: 200, reason: 'response was not JSON' };
        }
    }
    return { ok: false, status: 429, reason: 'key rate limit, still limited after one retry' };
}

/**
 * Walks `names` in order. For each: request(name) -> toItem(name, body) -> push(item).
 * A failed request, or a 200 that holds nothing worth selling, pushes NO item and so charges nothing; it is logged and the
 * loop moves on. Only a rejected key (401/402/403) stops the loop. push() must return the SDK's ChargeResult
 * (or undefined); eventChargeLimitReached ends the loop because the user's spending cap is hit.
 */
export async function collect({ names, request, toItem, push, log }) {
    const stats = { pushed: 0, failed: 0, empty: 0, authFailed: false, limitReached: false };
    for (const name of names) {
        const res = await request(name);
        if (!res.ok) {
            if (AUTH_STATUSES.has(res.status)) {
                stats.authFailed = true;
                log.error(`${name}: AgentFeed refused the actor's key (${res.reason}); stopping, nothing charged for this input`);
                break;
            }
            stats.failed++;
            log.warning(`${name}: ${res.reason}; no item pushed, nothing charged`);
            continue;
        }
        let item = null;
        try {
            item = toItem(name, res.body);
        } catch (err) {
            log.warning(`${name}: could not read the response (${err?.message}); no item pushed, nothing charged`);
        }
        if (!item) {
            stats.empty++;
            log.warning(`${name}: no usable data in the response; no item pushed, nothing charged`);
            continue;
        }
        const charge = await push(item);
        stats.pushed++;
        if (charge?.eventChargeLimitReached) {
            stats.limitReached = true;
            log.warning('The run reached its maximum charge; stopping.');
            break;
        }
    }
    return stats;
}

/** Upper-cases, trims, drops blanks and duplicates, and keeps only names matching `pattern`. Returns { valid, rejected }. */
export function cleanNames(raw, pattern, fallback) {
    const list = Array.isArray(raw) && raw.length > 0 ? raw : fallback;
    const valid = [];
    const rejected = [];
    for (const entry of list) {
        const name = String(entry ?? '').trim().toUpperCase();
        if (!name) continue;
        if (!pattern.test(name)) rejected.push(String(entry).slice(0, 40));
        else if (!valid.includes(name)) valid.push(name);
    }
    return { valid, rejected };
}
