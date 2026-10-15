// Builds test/fixtures/mixed-1000.json: 1,000 lines of the kinds a contact scraper leaves behind. Deterministic (no randomness).
import fs from 'node:fs';
const lines = [];
const REAL = ['gmail.com', 'outlook.com', 'apify.com', 'github.com', 'mozilla.org', 'wikipedia.org', 'python.org', 'nodejs.org', 'yahoo.com', 'icloud.com', 'proton.me', 'zoho.com', 'fastmail.com', 'cloudflare.com', 'stripe.com'];
const hex = (i) => (i * 2654435761 >>> 0).toString(16).padStart(8, '0').repeat(4).slice(0, 32);
for (let i = 0; i < 500; i++) lines.push(`user${i}@${REAL[i % REAL.length]}`);                                 // clean addresses on real mail domains
for (let i = 0; i < 50; i++) lines.push(`${['info', 'sales', 'support', 'admin', 'contact'][i % 5]}@${REAL[(i + 3) % REAL.length]}`); // role accounts
for (let i = 0; i < 50; i++) lines.push(`temp${i}@${['mailinator.com', 'guerrillamail.com', 'yopmail.com', 'sharklasers.com', 'trashmail.com'][i % 5]}`); // disposable
for (let i = 0; i < 60; i++) lines.push(`typo${i}@${['gmai.com', 'hotmial.com', 'yaho.com', 'gmail.con', 'outlok.com', 'gnail.com'][i % 6]}`); // typos
for (let i = 0; i < 80; i++) lines.push(`lead${i}@no-such-domain-${i}-af-test.com`);                          // dead domains (NXDOMAIN)
for (let i = 0; i < 20; i++) lines.push(`nomail${i}@${['yahooo.com', 'yhoo.com', 'gmail.co'][i % 3]}`);         // domains that publish a null MX
for (let i = 0; i < 20; i++) lines.push(`logo${i}@2x.png`, `icon${i}@3x.jpg`);                                // asset names
for (let i = 0; i < 20; i++) lines.push(`${hex(i)}@sentry.wixpress.com`, `${hex(i + 100)}@sentry.io`);       // tracking ids
for (let i = 0; i < 10; i++) lines.push(['name@example.com', 'you@domain.com', 'user@example.org', 'test@yourdomain.com', 'bootstrap@5.2.3'][i % 5]); // placeholders and versions
for (let i = 0; i < 40; i++) lines.push([`mailto:dirty${i}@gmail.com`, `%20dirty${i}@outlook.com`, `u003edirty${i}@apify.com`, `"dirty${i}@GitHub.com"`, `<dirty${i}@python.org>`][i % 5]); // scraper leftovers
for (let i = 0; i < 60; i++) lines.push(i % 3 === 0 ? `USER${(i % 33) * 15}@GMAIL.COM` : `user${(i % 33) * 15}@gmail.com`);              // repeats of the clean ones (case changed on every third)
for (let i = 0; i < 30; i++) lines.push(['hello world', 'N/A', 'none', 'see website', 'tel: 555-0100'][i % 5]);   // not addresses
for (let i = 0; i < 20; i++) lines.push('');                                                                    // blank lines
// a deterministic shuffle so the classes are mixed through the list
const order = lines.map((l, i) => [((i * 7919) % lines.length), l]).sort((a, b) => a[0] - b[0] || 0).map((x) => x[1]);
fs.writeFileSync(new URL('./mixed-1000.json', import.meta.url), JSON.stringify(order.slice(0, 1000)));
console.log('lines', order.length, 'written', Math.min(1000, order.length));
