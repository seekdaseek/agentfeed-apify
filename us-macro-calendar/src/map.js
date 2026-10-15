// Input handling and mapping for AgentFeed's /api/macro-calendar (the Fed, BLS and BEA release schedule).

export const EVENT_NAME = 'release';
export const SOURCE = 'AgentFeed (x402.ochinimus.app), dates read from the Federal Reserve, BLS and BEA pages named in each row';
export const TYPES = ['FOMC', 'CPI', 'NFP', 'PCE'];
export const DEFAULT_DAYS = 90;
export const MIN_DAYS = 1;
export const MAX_DAYS = 365;
export const AGENCY = {
    FOMC: 'Federal Reserve',
    CPI: 'Bureau of Labor Statistics',
    NFP: 'Bureau of Labor Statistics',
    PCE: 'Bureau of Economic Analysis',
};

const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v : null);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const DAY_MS = 86400000;

/**
 * What to run. No releases chosen means all four. A name that is not one of the four is reported and skipped; if nothing valid
 * is left, or `days` is not a whole number from 1 to 365, the result is an `error` (the run fails before any request, so
 * nothing is charged). The platform checks the same bounds against the input schema first.
 */
export function planInput(input) {
    const warnings = [];
    const asked = Array.isArray(input.types) ? input.types : [];
    const types = [];
    for (const raw of asked) {
        const t = String(raw ?? '').trim().toUpperCase();
        if (!t) continue;
        if (!TYPES.includes(t)) warnings.push(`"${String(raw).slice(0, 40)}" is not one of ${TYPES.join(', ')}; skipped.`);
        else if (!types.includes(t)) types.push(t);
    }
    if (asked.length > 0 && types.length === 0) return { error: `None of the releases you chose exists. Choose from ${TYPES.join(', ')}.`, warnings };
    let days = DEFAULT_DAYS;
    if (input.days !== undefined && input.days !== null) {
        days = input.days;
        if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) return { error: `Days ahead must be a whole number from ${MIN_DAYS} to ${MAX_DAYS}.`, warnings };
    }
    return { types: types.length > 0 ? types : [...TYPES], days, warnings };
}

/**
 * One item per release of a chosen type inside the window, in date order as the data source sends them, or [] when there is
 * nothing to sell (no events, a malformed answer, or none of the chosen types in the window). A row without a type, a date
 * or a UTC time is dropped rather than returned half empty.
 */
export function mapCalendar(types, body, fetchedAt = new Date().toISOString()) {
    const d = body?.data;
    if (!isObject(d) || !Array.isArray(d.events)) return [];
    const now = Date.parse(fetchedAt);
    const items = [];
    for (const e of d.events) {
        if (!isObject(e) || !types.includes(e.type)) continue;
        const date = str(e.date_new_york);
        const utc = str(e.utc);
        const at = utc ? Date.parse(utc) : NaN;
        if (!date || !utc || Number.isNaN(at)) continue;
        const nextOfType = isObject(d.next) && isObject(d.next[e.type]) ? d.next[e.type] : null;
        items.push({
            type: e.type,
            title: str(e.title) ?? e.type,
            agency: AGENCY[e.type],
            reference_period: str(e.reference_period),
            date,
            time_new_york: str(e.time_new_york),
            utc,
            days_until: Number.isNaN(now) ? null : Math.floor((at - now) / DAY_MS),
            is_next: nextOfType !== null && nextOfType.utc === utc,
            press_conference: typeof e.press_conference === 'boolean' ? e.press_conference : null,
            source_url: str(e.source_url),
            verified_at: str(e.verified_at),
            source: SOURCE,
            fetched_at: fetchedAt,
        });
    }
    return items;
}
