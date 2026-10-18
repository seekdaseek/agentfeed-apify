import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyJunk, isCharged, isDisposable, isFreeProvider, isRole, judge, mxProvider, normalizeEmail, suggestDomain, validSyntax } from '../src/core.js';

const DISP = new Set(['mailinator.com', 'guerrillamail.com']);
const MX_G = { kind: 'mx', hosts: [{ exchange: 'alt1.gmail-smtp-in.l.google.com', priority: 10 }, { exchange: 'gmail-smtp-in.l.google.com', priority: 5 }] };
const run = (raw, dns = MX_G) => judge(normalizeEmail(raw), dns, { disposableSet: DISP });

test('normalize: strips mailto:, its query, percent-encoding, u003e and u003c, quotes, brackets and trailing punctuation', () => {
    const cases = {
        '  info@acme.com  ': 'info@acme.com',
        'mailto:john@x.com?subject=Hi%20there': 'john@x.com',
        '%20jane@acme.com%20': 'jane@acme.com',
        'u003ejane@acme.com': 'jane@acme.com',
        'jane@acme.comu003c': 'jane@acme.com',
        '\\u003ejane@acme.com\\u003c': 'jane@acme.com',
        '"jane@acme.com"': 'jane@acme.com',
        '<jane@acme.com>': 'jane@acme.com',
        '(jane@acme.com).': 'jane@acme.com',
        'jane@acme.com,': 'jane@acme.com',
        'Bob Smith <bob@acme.com>': 'bob@acme.com',
        'jane​@acme.com': 'jane@acme.com',
    };
    for (const [raw, want] of Object.entries(cases)) assert.equal(normalizeEmail(raw).email, want, raw);
});

test('normalize: the domain is lower-cased and the local part keeps its case; fixed_from is set only when something changed', () => {
    const a = normalizeEmail('Jane.Doe@Gmail.COM');
    assert.equal(a.email, 'Jane.Doe@gmail.com');
    assert.equal(a.fixedFrom, 'Jane.Doe@Gmail.COM');
    const b = normalizeEmail('  jane@acme.com ');
    assert.equal(b.email, 'jane@acme.com');
    assert.equal(b.fixedFrom, null, 'only whitespace trimmed: nothing was fixed');
    assert.equal(normalizeEmail('x@bücher.de').email, 'x@xn--bcher-kva.de');
});

test('normalize: a string with no @ is not email-like, and a version string is not turned into an IPv4 address', () => {
    assert.deepEqual([normalizeEmail('hello world').emailLike, normalizeEmail('').emailLike, normalizeEmail(null).emailLike], [false, false, false]);
    assert.equal(normalizeEmail('bootstrap@5.2.3').email, 'bootstrap@5.2.3');
});

test('syntax: accepts normal and plus-tagged addresses, rejects the broken ones', () => {
    for (const [l, d] of [['jane.doe', 'acme.com'], ['a+tag', 'sub.acme.co.uk'], ['o\'brien', 'acme.com'], ['x', 'xn--bcher-kva.de']]) assert.equal(validSyntax(l, d), true, `${l}@${d}`);
    for (const [l, d] of [['', 'acme.com'], ['.jane', 'acme.com'], ['jane.', 'acme.com'], ['ja..ne', 'acme.com'], ['jane', 'acme'], ['jane', '-acme.com'], ['jane', 'acme..com'], ['jane', 'acme.c'], ['jane', 'acme.123'], ['a'.repeat(65), 'acme.com'], ['ja ne', 'acme.com'], ['jane', `${'a'.repeat(64)}.com`]]) assert.equal(validSyntax(l, d), false, `${l}@${d}`);
});

test('junk: asset names, version strings and paths are file_name; machine ids and error-tracking hosts are tracking_id; fill-ins are placeholder', () => {
    const n = (raw) => { const x = normalizeEmail(raw); return classifyJunk(x.local, x.domain); };
    for (const raw of ['logo@2x.png', 'icon@3x.jpg', 'sprite@2x.webp', 'bg@2x.svg', 'bootstrap@5.2.3', '//cdn.jsdelivr.net/npm/bootstrap@5.2.3', 'style@1.css']) assert.equal(n(raw), 'file_name', raw);
    for (const raw of ['5f3a9c1e7b2d4a6f8c0e1d3b5a7c9e2f@sentry.wixpress.com', 'abc@o12345.ingest.sentry.io', 'x@sentry.io', '123e4567-e89b-12d3-a456-426614174000@acme.com', '0123456789abcdef0123456789abcdef@acme.com']) assert.equal(n(raw), 'tracking_id', raw);
    for (const raw of ['name@example.com', 'user@example.org', 'you@domain.com', 'a@yourdomain.com', 'a@b.invalid', 'a@host.test', 'a@x.example']) assert.equal(n(raw), 'placeholder', raw);
    for (const raw of ['jane@acme.com', 'info@apify.com', 'someone@gmail.com', 'abcdef@acme.com']) assert.equal(n(raw), null, raw);
});

test('typos: one edit from a popular domain, named typos, and a mistyped ending are suggested; a popular or unrelated domain is not', () => {
    for (const [d, want] of [['gmial.com', 'gmail.com'], ['gmai.com', 'gmail.com'], ['gmail.con', 'gmail.com'], ['hotmial.com', 'hotmail.com'], ['yaho.com', 'yahoo.com'], ['outlok.com', 'outlook.com'], ['acme.con', 'acme.com'], ['acme.comm', 'acme.com'], ['iclod.com', 'icloud.com'], ['gmaail.com', 'gmail.com']]) assert.equal(suggestDomain(d), want, d);
    for (const d of ['gmail.com', 'yahoo.com', 'mail.com', 'acme.com', 'apify.com', 'bluewin.ch']) assert.equal(suggestDomain(d), null, d);
});

test('role accounts: exact words and a role word with a separator; a person is not a role', () => {
    for (const l of ['info', 'Sales', 'support', 'noreply', 'no-reply', 'info.chicago', 'sales_team', 'support+eu', 'billing-dept']) assert.equal(isRole(l), true, l);
    for (const l of ['webmasters', 'admins', 'administrators', 'postmasters', 'contacts', 'teams', 'invoices', 'account', 'order']) assert.equal(isRole(l), true, l);
    for (const l of ['jane', 'information', 'salesman', 'jane.info', 'assistant', 'teamwork']) assert.equal(isRole(l), false, l);
});

test('role verdict: webmasters@ and admins@ come back risky with the role reason, like webmaster@', () => {
    for (const e of ['webmaster@acme.com', 'webmasters@acme.com', 'admins@acme.com']) {
        const r = run(e);
        assert.equal(r.status, 'risky', e);
        assert.equal(r.role, true, e);
    }
    assert.equal(run('jane@acme.com').status, 'valid');
});

test('disposable: the domain or a parent is on the list; free providers are recognised', () => {
    assert.equal(isDisposable('mailinator.com', DISP), true);
    assert.equal(isDisposable('sub.mailinator.com', DISP), true);
    assert.equal(isDisposable('mymailinator.com', DISP), false);
    assert.equal(isDisposable('acme.com', DISP), false);
    assert.equal(isFreeProvider('gmail.com'), true);
    assert.equal(isFreeProvider('acme.com'), false);
});

test('mx provider: the lowest-priority host names the service; unknown hosts are other; no hosts is none', () => {
    assert.equal(mxProvider(MX_G.hosts), 'google');
    assert.equal(mxProvider([{ exchange: 'acme-com.mail.protection.outlook.com.', priority: 0 }]), 'microsoft');
    assert.equal(mxProvider([{ exchange: 'mx1.pphosted.com', priority: 10 }]), 'proofpoint');
    assert.equal(mxProvider([{ exchange: 'mail.acme-hosting.example', priority: 10 }]), 'other');
    assert.equal(mxProvider([]), 'none');
});

test('judge: a clean address on a domain with MX is valid with a provider; it never says deliverable or verified', () => {
    const r = run('jane@acme.com');
    assert.deepEqual([r.status, r.reasons, r.accepts_mail, r.mx_provider, r.mx_null], ['valid', [], true, 'google', false]);
    for (const key of Object.keys(r)) assert.doesNotMatch(key, /deliver|verified|exists/i);
    assert.ok(!['deliverable', 'verified'].includes(r.status));
});

test('judge: invalid = bad syntax, junk, null MX, NXDOMAIN, no mail host; each with its reason', () => {
    assert.deepEqual([run('jane@@acme.com', null).status, run('jane@@acme.com', null).reasons], ['invalid', ['invalid_syntax']]);
    assert.deepEqual([run('logo@2x.png', null).reasons, run('logo@2x.png', null).junk], [['junk_file_name'], 'file_name']);
    assert.deepEqual(run('x@example.com', null).reasons, ['junk_placeholder']);
    assert.deepEqual([run('a@acme.com', { kind: 'null_mx' }).reasons, run('a@acme.com', { kind: 'null_mx' }).mx_null, run('a@acme.com', { kind: 'null_mx' }).accepts_mail], [['null_mx'], true, false]);
    assert.deepEqual(run('a@acme.com', { kind: 'nxdomain' }).reasons, ['domain_not_found']);
    assert.deepEqual(run('a@acme.com', { kind: 'nodata' }).reasons, ['no_mail_host']);
    assert.deepEqual([run('hello world', null).status, run('hello world', null).reasons, run('hello world', null).email], ['invalid', ['not_an_email'], null]);
});

test('judge: risky = disposable, role, did_you_mean, A-record fallback; the reasons are listed together', () => {
    assert.deepEqual([run('a@mailinator.com').status, run('a@mailinator.com').reasons], ['risky', ['disposable']]);
    assert.deepEqual([run('info@acme.com').status, run('info@acme.com').reasons, run('info@acme.com').role], ['risky', ['role_account'], true]);
    const typo = run('john@gmial.com');
    assert.deepEqual([typo.status, typo.reasons, typo.did_you_mean], ['risky', ['did_you_mean'], 'john@gmail.com']);
    const fb = run('jane@acme.com', { kind: 'a_fallback' });
    assert.deepEqual([fb.status, fb.reasons, fb.accepts_mail, fb.mx_provider], ['risky', ['a_record_fallback'], true, 'none']);
    assert.deepEqual(run('info@mailinator.com').reasons, ['disposable', 'role_account']);
    assert.equal(run('jane@gmail.com').free_provider, true);
});

test('judge: unknown = a DNS lookup that did not finish; the list-based flags are still reported', () => {
    const r = run('info@acme.com', { kind: 'error', code: 'timeout' });
    assert.deepEqual([r.status, r.reasons, r.accepts_mail], ['unknown', ['dns_timeout', 'role_account'], null]);
    assert.deepEqual(run('a@acme.com', { kind: 'error', code: 'ESERVFAIL' }).reasons, ['dns_error']);
});

test('charging: valid, invalid and risky are charged; unknown, a repeat and a non-address are not', () => {
    assert.equal(isCharged(run('jane@acme.com')), true);
    assert.equal(isCharged(run('logo@2x.png', null)), true);
    assert.equal(isCharged(run('info@acme.com')), true);
    assert.equal(isCharged(run('a@acme.com', { kind: 'error', code: 'timeout' })), false);
    assert.equal(isCharged({ ...run('jane@acme.com'), duplicate_of: 'jane@acme.com' }), false);
    assert.equal(isCharged(run('hello world', null)), false);
});

test('control: the junk test can fail (a real-looking address is not junk) and a typo rule does not flag a popular domain', () => {
    assert.equal(classifyJunk('jane', 'acme.com'), null);
    assert.equal(suggestDomain('gmail.com'), null);
});
