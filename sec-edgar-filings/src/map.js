// Input handling and mapping for AgentFeed's /api/sec-filings (recent EDGAR filings for one ticker).

export const EVENT_NAME = 'filing';
export const SOURCE = 'SEC EDGAR (sec.gov), public filings, via AgentFeed (x402.ochinimus.app)';
export const DEFAULT_TICKERS = ['AAPL'];
export const DEFAULT_LIMIT = 10;
export const MAX_TICKERS = 50;

const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);

export const normalizeTicker = (s) => {
    const t = s.toUpperCase();
    return /^[A-Z0-9.\-]{1,10}$/.test(t) ? t : null;
};

/** One EDGAR form type: upper case, single spaces. Empty input means no filter (null); an invalid one is reported as { error }. */
export function cleanForm(raw) {
    if (raw === undefined || raw === null || String(raw).trim() === '') return { form: null };
    const form = String(raw).trim().toUpperCase().replace(/\s+/g, ' ');
    return /^[A-Z0-9][A-Z0-9\-/ ]{0,13}$/.test(form) ? { form } : { error: `form "${String(raw).slice(0, 30)}" is not an EDGAR form type. Use for example 10-K, 10-Q, 8-K, 4, S-1, DEF 14A or 13F-HR.` };
}

export function cleanLimit(raw) {
    const n = Math.round(Number(raw));
    if (raw === undefined || raw === null || raw === '' || !Number.isFinite(n)) return DEFAULT_LIMIT;
    return Math.min(Math.max(n, 1), 50);
}

/** Turns the actor input into jobs. With no tickers at all it runs the default; a bad form is an error, never silently dropped. */
export function planJobs(input, cleanList) {
    const t = cleanList(input.tickers, { normalize: normalizeTicker, max: MAX_TICKERS });
    const nothingAsked = t.valid.length === 0 && t.rejected.length === 0;
    const tickers = nothingAsked ? DEFAULT_TICKERS : t.valid;
    const f = cleanForm(input.form);
    return {
        jobs: f.error ? [] : tickers.map((name) => ({ name })),
        form: f.form ?? null,
        limit: cleanLimit(input.limit_per_ticker),
        error: f.error ?? null,
        warnings: t.rejected.map((r) => `"${r}" is not a US ticker (letters, digits, dot or dash, up to 10 characters, or over the limit of ${MAX_TICKERS}); skipped.`),
    };
}

/** One item per filing. A ticker with no filing of that form (the route answers 200 and bills the key anyway) is no items. */
export function mapFilings(ticker, body, fetchedAt = new Date().toISOString()) {
    const d = body?.data;
    if (!d || !Array.isArray(d.filings)) return [];
    return d.filings.filter((f) => f && typeof f === 'object' && f.accession).map((f) => ({
        ticker: str(d.ticker) ?? ticker,
        company: str(d.company),
        cik: str(d.cik),
        form: str(f.form),
        filing_date: str(f.filed),
        report_date: str(f.report_date),
        accession_number: str(f.accession),
        description: str(f.description),
        items: str(f.items),
        document_url: str(f.document_url),
        index_url: str(f.index_url),
        source: SOURCE,
        fetched_at: fetchedAt,
    }));
}
