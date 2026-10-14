// Input handling and mapping for AgentFeed's /api/papers (OpenAlex search) and /api/paper/:doi (one work).

export const EVENT_NAME = 'paper';
export const SOURCE = 'OpenAlex (openalex.org), via AgentFeed (x402.ochinimus.app)';
export const LICENSE = 'CC0';
export const DEFAULT_QUERIES = ['large language models'];
export const DEFAULT_DOIS = ['10.1038/nature14539'];
export const DEFAULT_LIMIT = 10;
export const MAX_QUERIES = 20;
export const MAX_DOIS = 50;
export const MAX_QUERY_CHARS = 200;

const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const normalizeQuery = (s) => (s.length <= MAX_QUERY_CHARS ? s : null);

/** Accepts 10.x/y, doi:10.x/y, https://doi.org/10.x/y and a %2F-encoded slash. Returns the bare DOI or null. */
export function normalizeDoi(s) {
    const bare = s.replace(/%2F/gi, '/').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
    return bare.length <= 200 && /^10\.\d{4,9}\/\S+$/.test(bare) ? bare : null;
}

export function cleanYear(raw, now = new Date()) {
    if (raw === undefined || raw === null || raw === '') return { year: null };
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1000 && n <= now.getUTCFullYear() + 1 ? { year: n } : { year: null, warning: `year_from "${String(raw).slice(0, 20)}" is not a four-digit year; ignored.` };
}

export function cleanLimit(raw) {
    const n = Math.round(Number(raw));
    if (raw === undefined || raw === null || raw === '' || !Number.isFinite(n)) return DEFAULT_LIMIT;
    return Math.min(Math.max(n, 1), 25);
}

/** Turns the actor input into the list of jobs. With no queries and no DOIs at all, runs the defaults. */
export function planJobs(input, cleanList, now = new Date()) {
    const q = cleanList(input.queries, { normalize: normalizeQuery, max: MAX_QUERIES });
    const d = cleanList(input.dois, { normalize: normalizeDoi, max: MAX_DOIS });
    const nothingAsked = q.valid.length === 0 && d.valid.length === 0 && q.rejected.length === 0 && d.rejected.length === 0;
    const queries = nothingAsked ? DEFAULT_QUERIES : q.valid;
    const dois = nothingAsked ? DEFAULT_DOIS : d.valid;
    const y = cleanYear(input.year_from, now);
    const warnings = [
        ...q.rejected.map((r) => `query "${r}" skipped (empty after cleanup, over ${MAX_QUERY_CHARS} characters, or over the limit of ${MAX_QUERIES}).`),
        ...d.rejected.map((r) => `"${r}" is not a DOI (expected 10.1038/nature14539 or https://doi.org/10.1038/nature14539, or over the limit of ${MAX_DOIS}); skipped.`),
        ...(y.warning ? [y.warning] : []),
    ];
    return {
        jobs: [...queries.map((name) => ({ kind: 'query', name })), ...dois.map((name) => ({ kind: 'doi', name }))],
        year: y.year,
        limit: cleanLimit(input.max_results_per_query),
        warnings,
    };
}

function paperItem(query, p, fetchedAt) {
    const oa = p.open_access && typeof p.open_access === 'object' ? p.open_access : {};
    return {
        query,
        title: str(p.title),
        year: num(p.year),
        doi: str(p.doi),
        authors: Array.isArray(p.authors) ? p.authors.filter((a) => typeof a === 'string') : [],
        authors_total: num(p.authors_total),
        venue: str(p.venue),
        type: str(p.type),
        cited_by_count: num(p.cited_by),
        is_open_access: oa.is_oa === true,
        open_access_url: str(oa.url),
        abstract: str(p.abstract),
        openalex_id: str(p.openalex_id),
        source: SOURCE,
        license: LICENSE,
        fetched_at: fetchedAt,
    };
}

/** One item per paper of a search. Zero papers (the route answers 200 and bills the key anyway) is no items. */
export function mapSearch(query, body, fetchedAt = new Date().toISOString()) {
    const papers = body?.data?.papers;
    if (!Array.isArray(papers)) return [];
    return papers.filter((p) => p && typeof p === 'object' && (p.title || p.doi)).map((p) => paperItem(query, p, fetchedAt));
}

/** One item for a DOI lookup, or [] when the answer holds neither a title nor a DOI. */
export function mapDoi(doi, body, fetchedAt = new Date().toISOString()) {
    const d = body?.data;
    if (!d || typeof d !== 'object' || (!d.title && !d.doi)) return [];
    return [paperItem(null, { ...d, doi: d.doi ?? doi }, fetchedAt)];
}
