// Input handling and mapping for AgentFeed's /api/pdf-markdown (one caller-supplied PDF URL to markdown).

export const EVENT_NAME = 'pdf';
export const SOURCE = 'AgentFeed, PDF fetched once from the URL you supplied';
export const DEFAULT_URLS = ['https://bitcoin.org/bitcoin.pdf'];
export const MAX_URLS = 50;
export const MAX_URL_CHARS = 2048;

const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** An absolute http or https URL without credentials, as typed (the data source decides what it will fetch). */
export function normalizeUrl(s) {
    if (s.length > MAX_URL_CHARS) return null;
    let u;
    try { u = new URL(s); } catch { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password || !u.hostname) return null;
    return s;
}

/** With no URLs at all it runs the default PDF; a rejected URL is reported, never replaced by the default. */
export function planJobs(input, cleanList) {
    const u = cleanList(input.urls, { normalize: normalizeUrl, max: MAX_URLS });
    const nothingAsked = u.valid.length === 0 && u.rejected.length === 0;
    return {
        jobs: (nothingAsked ? DEFAULT_URLS : u.valid).map((name) => ({ name })),
        warnings: u.rejected.map((r) => `"${r}" is not an http or https URL (no credentials, up to ${MAX_URL_CHARS} characters, or over the limit of ${MAX_URLS}); skipped.`),
    };
}

/** The words of the text itself: the "## Page N" headings the data source adds to every page are not words. */
export const countWords = (markdown) => (markdown.replace(/^## Page \d+[ \t]*$/gm, '').match(/\S+/g) || []).length;

/**
 * One item for the PDF, or [] when there is nothing to sell. The data source converts a scanned PDF without error and bills it,
 * and its own word_count includes the page headings (3,586 for a text of 3,559 words), so it can never be zero. The words are
 * counted here instead, and a PDF with none (no text layer) must not become a charged item.
 */
export function mapPdf(url, body, fetchedAt = new Date().toISOString()) {
    const d = body?.data;
    if (!d || typeof d.markdown !== 'string') return [];
    const words = countWords(d.markdown);
    if (words === 0) return [];
    return [{
        url,
        final_url: str(d.final_url) ?? url,
        title: str(d.title),
        pages: num(d.pages),
        words,
        bytes: num(d.bytes),
        truncated: d.truncated === true,
        markdown: d.markdown,
        rights: str(d.rights),
        source: SOURCE,
        fetched_at: fetchedAt,
    }];
}
