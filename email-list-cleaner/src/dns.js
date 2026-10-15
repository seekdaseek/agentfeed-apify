// DNS for the email cleaner: the system resolver first, DNS over HTTPS (port 443) when the system resolver does not work.
// No Apify SDK in here. Answers are plain values the core module understands:
//   { kind: 'mx', hosts } | { kind: 'null_mx' } | { kind: 'nxdomain' } | { kind: 'nodata' } | { kind: 'a_fallback' } | { kind: 'error', code }
import dns from 'node:dns';

const DNS_TIMEOUT_MS = 4000;
const DOH_URL = 'https://cloudflare-dns.com/dns-query';
// Error codes that mean "the resolver itself is not usable", as opposed to "this domain has no such record".
const RESOLVER_BROKEN = new Set(['ECONNREFUSED', 'ETIMEOUT', 'EREFUSED', 'ESERVFAIL', 'ECONNRESET', 'EAI_AGAIN', 'ENOTIMP', 'EBADRESP', 'EBADQUERY', 'ECANCELLED']);

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

/** Maps one MX answer (hosts) to a kind; an MX of "." with priority 0 is a null MX (RFC 7505). */
export function mxKind(hosts) {
    if (!Array.isArray(hosts) || hosts.length === 0) return { kind: 'nodata' };
    const real = hosts.filter((h) => h.exchange && h.exchange !== '.');
    if (real.length === 0) return { kind: 'null_mx' };
    return { kind: 'mx', hosts: real.map((h) => ({ exchange: h.exchange, priority: h.priority })) };
}

/** The system resolver. Errors come back as { error: code } so the caller can decide to switch to DoH. */
export function systemResolver({ timeoutMs = DNS_TIMEOUT_MS, lib = dns.promises } = {}) {
    return {
        name: 'system',
        async mx(domain) {
            try { return mxKind(await withTimeout(lib.resolveMx(domain), timeoutMs)); } catch (e) {
                if (e.code === 'ENOTFOUND') return { kind: 'nxdomain' };
                if (e.code === 'ENODATA') return { kind: 'nodata' };
                return { error: e.code || e.name || 'ERROR' };
            }
        },
        async addr(domain) {
            let broken = null;
            for (const fn of [lib.resolve4, lib.resolve6]) {
                try { const r = await withTimeout(fn.call(lib, domain), timeoutMs); if (r.length > 0) return { found: true }; } catch (e) {
                    if (e.code !== 'ENOTFOUND' && e.code !== 'ENODATA') broken = e.code || e.name || 'ERROR';
                }
            }
            return broken ? { error: broken } : { found: false };
        },
    };
}

/** DNS over HTTPS (JSON API of Cloudflare), over port 443, for platforms whose resolver does not answer. */
export function dohResolver({ fetchFn = globalThis.fetch, timeoutMs = 5000, url = DOH_URL } = {}) {
    const query = async (name, type) => {
        const res = await fetchFn(`${url}?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) throw Object.assign(new Error(`DoH HTTP ${res.status}`), { code: `DOH_HTTP_${res.status}` });
        return res.json();
    };
    return {
        name: 'doh',
        async mx(domain) {
            try {
                const j = await query(domain, 'MX');
                if (j.Status === 3) return { kind: 'nxdomain' };
                if (j.Status !== 0) return { error: `DOH_STATUS_${j.Status}` };
                const hosts = (j.Answer || []).filter((a) => a.type === 15).map((a) => { const [p, ...rest] = String(a.data).trim().split(/\s+/); return { priority: Number(p), exchange: (rest.join(' ') || '').replace(/\.$/, '') || '.' }; });
                return mxKind(hosts.map((h) => (h.exchange === '' ? { ...h, exchange: '.' } : h)));
            } catch (e) { return { error: e.code || e.name || 'ERROR' }; }
        },
        async addr(domain) {
            try {
                for (const type of ['A', 'AAAA']) {
                    const j = await query(domain, type);
                    if (j.Status === 0 && (j.Answer || []).some((a) => a.type === (type === 'A' ? 1 : 28))) return { found: true };
                }
                return { found: false };
            } catch (e) { return { error: e.code || e.name || 'ERROR' }; }
        },
    };
}

/**
 * The resolver the actor uses: the system resolver until `switchAfter` lookups in a row fail because the resolver itself is
 * broken, then DoH for the rest of the run (and the failed lookups are retried there). `stats` records which path answered.
 */
export function createResolver({ primary = systemResolver(), fallback = dohResolver(), switchAfter = 3, log = () => {} } = {}) {
    const stats = { system: 0, doh: 0, switchedAt: null, errors: 0 };
    let active = primary;
    let consecutiveBroken = 0;
    const call = async (method, domain) => {
        let r = await active[method](domain);
        if (r.error && active === primary && RESOLVER_BROKEN.has(r.error)) {
            consecutiveBroken++;
            if (consecutiveBroken >= switchAfter) { active = fallback; stats.switchedAt = stats.system + stats.doh; log(`The system resolver failed ${consecutiveBroken} lookups in a row (${r.error}); using DNS over HTTPS from now on.`); }
            if (active === fallback) r = await active[method](domain);
        } else if (!r.error) consecutiveBroken = 0;
        stats[active.name]++;
        if (r.error) stats.errors++;
        return r;
    };
    return {
        stats,
        get path() { return active.name; },
        /** One domain to a core DNS answer. */
        async lookup(domain) {
            const m = await call('mx', domain);
            if (m.error) return { kind: 'error', code: /TIMEOUT/i.test(m.error) ? 'timeout' : m.error };
            if (m.kind !== 'nodata') return m;
            const a = await call('addr', domain);
            if (a.error) return { kind: 'error', code: /TIMEOUT/i.test(a.error) ? 'timeout' : a.error };
            return a.found ? { kind: 'a_fallback' } : { kind: 'nodata' };
        },
    };
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping the result order. */
export async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const worker = async () => { while (true) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i], i); } };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
}
