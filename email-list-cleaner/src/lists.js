// Small lists the checks use. The disposable-domain list is a snapshot of a CC0 project (see SOURCES.md); everything in this
// file is our own work, written for this actor, so it carries no third-party licence.

export const ROLES = new Set([
    'abuse', 'accounting', 'accounts', 'admin', 'administrator', 'billing', 'bookings', 'careers', 'compliance', 'contact', 'contactus', 'contact-us',
    'customerservice', 'customer-service', 'customercare', 'dev', 'devnull', 'do-not-reply', 'donotreply', 'enquiries', 'enquiry', 'feedback', 'finance',
    'general', 'help', 'helpdesk', 'hello', 'hostmaster', 'hr', 'info', 'inquiries', 'inquiry', 'it', 'jobs', 'legal', 'mail', 'mailer-daemon', 'marketing',
    'media', 'news', 'newsletter', 'no-reply', 'noreply', 'office', 'ops', 'orders', 'partners', 'partnerships', 'payments', 'postmaster', 'pr', 'press',
    'privacy', 'recruiting', 'recruitment', 'reception', 'remove', 'reservations', 'returns', 'root', 'sales', 'security', 'service', 'services', 'shop',
    'spam', 'subscribe', 'support', 'team', 'tech', 'unsubscribe', 'webmaster', 'welcome', 'www',
]);

// A role word followed by a separator and more text (info.chicago@, sales_team@, support+eu@) is a role account as well.
export const ROLE_PREFIXES = ['info', 'sales', 'support', 'admin', 'contact', 'hello', 'office', 'billing', 'noreply', 'no-reply', 'enquiries', 'hr', 'jobs', 'careers', 'marketing', 'service', 'help', 'press', 'orders'];

export const FREE_PROVIDERS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it', 'yahoo.ca', 'yahoo.com.br', 'yahoo.co.in', 'yahoo.co.jp',
    'yahoo.com.au', 'ymail.com', 'rocketmail.com', 'outlook.com', 'outlook.fr', 'outlook.de', 'outlook.es', 'outlook.it', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr',
    'hotmail.de', 'hotmail.es', 'hotmail.it', 'live.com', 'live.co.uk', 'live.fr', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'aim.com',
    'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'web.de', 'mail.com', 'email.com', 'zoho.com', 'zohomail.com',
    'yandex.com', 'yandex.ru', 'ya.ru', 'mail.ru', 'inbox.ru', 'list.ru', 'bk.ru', 'rambler.ru', 'qq.com', '163.com', '126.com', 'sina.com', 'naver.com',
    'daum.net', 'hanmail.net', 'tutanota.com', 'tuta.io', 'tutamail.com', 'fastmail.com', 'hey.com', 'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net',
    'bellsouth.net', 'cox.net', 'charter.net', 'earthlink.net', 'orange.fr', 'wanadoo.fr', 'free.fr', 'laposte.net', 'sfr.fr', 'libero.it', 'virgilio.it',
    't-online.de', 'freenet.de', 'seznam.cz', 'wp.pl', 'o2.pl', 'interia.pl', 'abv.bg', 'ukr.net', 'btinternet.com', 'sky.com', 'talktalk.net', 'rediffmail.com',
]);

// Popular mailbox domains a typo is measured against. A domain on this list is never flagged; one a single edit away from it is.
export const POPULAR_DOMAINS = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'msn.com', 'protonmail.com', 'proton.me', 'me.com', 'mail.com',
    'gmx.com', 'gmx.de', 'gmx.net', 'comcast.net', 'yahoo.co.uk', 'hotmail.co.uk', 'googlemail.com', 'ymail.com', 'web.de', 'yandex.com', 'mail.ru', 'qq.com',
    '163.com', 'att.net', 'verizon.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'orange.fr', 'free.fr', 'hotmail.fr', 'hotmail.it', 'libero.it', 't-online.de',
    'live.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it', 'outlook.fr', 'outlook.de', 'zoho.com', 'fastmail.com', 'tutanota.com',
];

// Whole-domain typos that are common enough to be named outright (two edits, or a swapped TLD, are not caught by the one-edit rule).
export const KNOWN_TYPOS = {
    'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com',
    'gmil.com': 'gmail.com', 'gimail.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.con': 'gmail.com', 'gmali.com': 'gmail.com',
    'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotnail.com': 'hotmail.com', 'homail.com': 'hotmail.com',
    'outlok.com': 'outlook.com', 'outloook.com': 'outlook.com', 'outlool.com': 'outlook.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com',
    'yhoo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'iclould.com': 'icloud.com', 'icloud.con': 'icloud.com', 'icoud.com': 'icloud.com',
};

// A top-level domain typed wrong on any domain: ".con" for ".com" and the like. None of these is a real top-level domain.
export const TLD_TYPOS = { con: 'com', cmo: 'com', comm: 'com', vom: 'com', xom: 'com', cim: 'com', ocm: 'com', c0m: 'com', coom: 'com', cpm: 'com', clm: 'com', ent: 'net', ner: 'net', nte: 'net', ogr: 'org', orgg: 'org' };

// File extensions that appear as the "top-level domain" of an asset name read as an address: logo@2x.png, icon@3x.jpg.
export const ASSET_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tif', 'tiff', 'avif', 'heic', 'css', 'scss', 'js', 'mjs', 'ts', 'map', 'json', 'woff', 'woff2',
    'ttf', 'otf', 'eot', 'mp4', 'webm', 'mp3', 'wav', 'ogg', 'pdf', 'gz', 'tgz', 'html', 'htm', 'php', 'xml', 'txt', 'md',
]);

// Error-tracking and telemetry hosts whose "addresses" are machine ids (abc123...@sentry.wixpress.com).
export const TRACKING_DOMAINS = ['sentry.io', 'sentry.wixpress.com', 'sentry-next.wixpress.com', 'sentry.shopifyapps.com', 'ingest.sentry.io'];

// Names written into templates and forms. The reserved names are from RFC 2606 and RFC 6761; the rest are the usual fill-ins.
export const PLACEHOLDER_DOMAINS = new Set([
    'example.com', 'example.org', 'example.net', 'example.edu', 'domain.com', 'domain.tld', 'yourdomain.com', 'yourdomain.tld', 'yourcompany.com', 'yoursite.com',
    'yourwebsite.com', 'mydomain.com', 'mycompany.com', 'email.tld', 'company.tld', 'sample.com', 'sampledomain.com',
]);
export const PLACEHOLDER_TLDS = new Set(['example', 'invalid', 'test', 'localhost']);

// Which service runs a domain's mail, read from the MX host names. First match wins.
export const MX_PROVIDERS = [
    ['google', /(^|\.)(google|googlemail)\.com$/],
    ['microsoft', /(^|\.)(outlook\.com|protection\.outlook\.com|hotmail\.com)$/],
    ['zoho', /(^|\.)zoho\.(com|eu|in|com\.au|jp)$/],
    ['proofpoint', /(^|\.)(pphosted\.com|ppe-hosted\.com|proofpoint\.com)$/],
    ['mimecast', /(^|\.)mimecast(\.com|\.co\.za|\.us)$/],
    ['barracuda', /(^|\.)barracudanetworks\.com$/],
    ['yahoo', /(^|\.)yahoodns\.net$/],
    ['icloud', /(^|\.)(icloud\.com|me\.com|apple\.com)$/],
    ['proton', /(^|\.)(protonmail\.ch|proton\.me)$/],
    ['fastmail', /(^|\.)messagingengine\.com$/],
    ['mailgun', /(^|\.)mailgun\.org$/],
    ['cloudflare', /(^|\.)mx\.cloudflare\.net$/],
    ['godaddy', /(^|\.)secureserver\.net$/],
    ['ionos', /(^|\.)(ionos\.(com|de|fr|es|co\.uk)|kundenserver\.de|1and1\.(com|fr))$/],
    ['ovh', /(^|\.)ovh\.net$/],
    ['namecheap', /(^|\.)(privateemail\.com|registrar-servers\.com)$/],
    ['yandex', /(^|\.)yandex\.(net|ru|com)$/],
    ['mailru', /(^|\.)mail\.ru$/],
];
