// Pure email-cleaning logic: normalise a raw string, classify junk, judge a domain's DNS answer. No Apify SDK, no network and no
// file access in here, so the same module can be wrapped by another service later. DNS answers come in as plain values.
import { domainToASCII } from 'node:url';
import {
    ASSET_EXTENSIONS, FREE_PROVIDERS, KNOWN_TYPOS, MX_PROVIDERS, PLACEHOLDER_DOMAINS, PLACEHOLDER_TLDS, POPULAR_DOMAINS, ROLES, ROLE_PREFIXES, TLD_TYPOS, TRACKING_DOMAINS,
} from './lists.js';

export const STATUSES = ['valid', 'invalid', 'risky', 'unknown'];

const LOCAL_ASCII = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const HEX_ID = /^(?:[0-9a-f]{28,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const INVISIBLE = /[​-‍⁠﻿]/g;

/**
 * Raw text to a clean address. Strips what scrapers leave around an address (mailto:, %20, the JSON remnants u003e and u003c,
 * quotes, angle brackets, trailing punctuation), takes the address out of "Name <a@b.c>", lowercases the domain and converts an
 * international domain to its ASCII form. The local part keeps its case. Returns { email, local, domain, fixedFrom, emailLike }:
 * `email` is null when no "@" is left to work with.
 */
export function normalizeEmail(raw) {
    const input = typeof raw === 'string' ? raw : String(raw ?? '');
    let s = input.replace(INVISIBLE, '').trim();
    if (/^mailto:/i.test(s)) s = s.slice(7).split('?')[0];
    if (s.includes('%')) {
        try { s = decodeURIComponent(s); } catch { s = s.replace(/%20/gi, ' ').replace(/%40/g, '@'); }
    }
    s = s.replace(/^(?:\\?u003[ce])+/i, '').replace(/(?:\\?u003[ce])+$/i, '');
    const named = /<([^<>\s]+@[^<>\s]+)>/.exec(s);
    if (named) s = named[1];
    s = s.trim().replace(/^[\s'"`‘’“”<([{]+/, '').replace(/[\s'"`‘’“”>)\]}.,;:!?]+$/, '');
    const emailLike = s.includes('@');
    if (!emailLike) return { email: null, local: null, domain: null, fixedFrom: null, emailLike: false, input };
    const at = s.lastIndexOf('@');
    const local = s.slice(0, at);
    let domain = s.slice(at + 1).toLowerCase();
    // only an international domain is converted: the URL parser would read a version string such as 5.2.3 as an IPv4 address
    if (/[^\x00-\x7f]/.test(domain)) domain = domainToASCII(domain) || domain;
    const email = `${local}@${domain}`;
    return { email, local, domain, fixedFrom: email === input.trim() ? null : input, emailLike: true, input };
}

/** Strict-enough syntax: one "@", a dot-atom local part of up to 64 characters, a domain of valid labels with a real-looking top-level domain. */
export function validSyntax(local, domain) {
    if (!local || local.length > 64 || local.includes('@')) return false;
    if (!LOCAL_ASCII.test(local) && !/[^\x00-\x7f]/.test(local)) return false;
    if (/[^\x00-\x7f]/.test(local) && /[\s@<>()[\]\\,;:"]/.test(local)) return false;
    if (!domain || domain.length > 253) return false;
    const labels = domain.split('.');
    return labels.length >= 2 && labels.every((l) => LABEL.test(l)) && TLD.test(labels[labels.length - 1]);
}

/** file_name, tracking_id or placeholder when the "address" is no mailbox at all, otherwise null. Checked before any DNS lookup. */
export function classifyJunk(local, domain) {
    const labels = (domain || '').split('.');
    const tld = labels[labels.length - 1];
    if (/^\d+(\.\d+){1,2}$/.test(domain || '') || (local || '').includes('/') || ASSET_EXTENSIONS.has(tld)) return 'file_name';
    if (TRACKING_DOMAINS.some((t) => domain === t || (domain || '').endsWith(`.${t}`)) || HEX_ID.test(local || '')) return 'tracking_id';
    if (PLACEHOLDER_DOMAINS.has(domain) || PLACEHOLDER_TLDS.has(tld)) return 'placeholder';
    return null;
}

export const isRole = (local) => {
    const l = (local || '').toLowerCase();
    return ROLES.has(l) || ROLE_PREFIXES.some((p) => l.startsWith(p) && /^[._+-]/.test(l.slice(p.length)));
};

export const isFreeProvider = (domain) => FREE_PROVIDERS.has(domain);

/** A domain or one of its parents is on the disposable list (sub.mailinator.com). `set` is a Set of lowercase domains. */
export function isDisposable(domain, set) {
    const parts = (domain || '').split('.');
    for (let i = 0; i <= parts.length - 2; i++) if (set.has(parts.slice(i).join('.'))) return true;
    return false;
}

function editDistanceAtMostOne(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
    const [s, l] = a.length < b.length ? [a, b] : [b, a];
    return s.slice(i) === l.slice(i + 1);
}

/** A corrected domain when the typed one is a likely typo of a popular mailbox domain or has a mistyped top-level domain, else null. */
export function suggestDomain(domain) {
    if (!domain || POPULAR_DOMAINS.includes(domain)) return null;
    if (KNOWN_TYPOS[domain]) return KNOWN_TYPOS[domain];
    const labels = domain.split('.');
    const fixedTld = TLD_TYPOS[labels[labels.length - 1]];
    if (fixedTld && labels.length >= 2) return [...labels.slice(0, -1), fixedTld].join('.');
    return POPULAR_DOMAINS.find((p) => editDistanceAtMostOne(domain, p)) ?? null;
}

/** The service behind a domain's mail, from its MX host names: google, microsoft, ..., other (an MX we do not know) or none. */
export function mxProvider(hosts) {
    if (!hosts || hosts.length === 0) return 'none';
    const lowest = [...hosts].sort((a, b) => a.priority - b.priority)[0].exchange.toLowerCase().replace(/\.$/, '');
    for (const [name, re] of MX_PROVIDERS) if (re.test(lowest)) return name;
    return 'other';
}

/**
 * Turns a normalised address and a DNS answer into the verdict record. `dns` is one of
 *   { kind: 'mx', hosts: [{ exchange, priority }] } | { kind: 'null_mx' } | { kind: 'nxdomain' } | { kind: 'nodata' } | { kind: 'a_fallback' }
 *   | { kind: 'error', code } | null (not looked up, because the syntax or the junk test already failed).
 * No outcome here says a mailbox exists: valid means "the domain takes mail and nothing about the address looks wrong".
 */
export function judge(norm, dns, { disposableSet }) {
    const { email, local, domain } = norm;
    const base = {
        input: norm.input, email, status: 'valid', reasons: [], fixed_from: norm.fixedFrom, junk: null, domain: domain ?? null, accepts_mail: null, mx_null: false,
        mx_provider: null, disposable: false, role: false, free_provider: false, did_you_mean: null, duplicate_of: null,
    };
    if (!norm.emailLike) return { ...base, email: null, status: 'invalid', reasons: ['not_an_email'] };
    if (!validSyntax(local, domain)) {
        const junk = classifyJunk(local, domain);
        return { ...base, status: 'invalid', reasons: junk ? [`junk_${junk}`] : ['invalid_syntax'], junk, domain: domain || null };
    }
    const junk = classifyJunk(local, domain);
    if (junk) return { ...base, status: 'invalid', reasons: [`junk_${junk}`], junk };
    const rec = { ...base, disposable: isDisposable(domain, disposableSet), role: isRole(local), free_provider: isFreeProvider(domain), did_you_mean: null };
    const fixedDomain = suggestDomain(domain);
    if (fixedDomain) rec.did_you_mean = `${local}@${fixedDomain}`;
    const flags = [];
    if (rec.disposable) flags.push('disposable');
    if (rec.role) flags.push('role_account');
    if (rec.did_you_mean) flags.push('did_you_mean');
    if (/[^\x00-\x7f]/.test(local)) flags.push('non_ascii_local_part');
    switch (dns?.kind) {
        case 'nxdomain': return { ...rec, status: 'invalid', reasons: ['domain_not_found'], accepts_mail: false, mx_provider: 'none' };
        case 'null_mx': return { ...rec, status: 'invalid', reasons: ['null_mx'], accepts_mail: false, mx_null: true, mx_provider: 'none' };
        case 'nodata': return { ...rec, status: 'invalid', reasons: ['no_mail_host'], accepts_mail: false, mx_provider: 'none' };
        case 'error': return { ...rec, status: 'unknown', reasons: [dns.code === 'timeout' ? 'dns_timeout' : 'dns_error', ...flags] };
        case 'a_fallback': {
            const reasons = ['a_record_fallback', ...flags];
            return { ...rec, status: 'risky', reasons, accepts_mail: true, mx_provider: 'none' };
        }
        case 'mx': return { ...rec, status: flags.length ? 'risky' : 'valid', reasons: flags, accepts_mail: true, mx_provider: mxProvider(dns.hosts) };
        default: return { ...rec, status: 'unknown', reasons: ['not_looked_up', ...flags] };
    }
}

/** Does this verdict get charged? One per unique address that really got a verdict: valid, invalid or risky; never unknown, never a duplicate, never a line that is not an address. */
export const isCharged = (rec) => rec.duplicate_of === null && ['valid', 'invalid', 'risky'].includes(rec.status) && !rec.reasons.includes('not_an_email');
