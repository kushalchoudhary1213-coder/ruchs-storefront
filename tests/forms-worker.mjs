import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {createLocalDb} from '../scripts/local_quota.mjs';

const origin = 'https://myruchs.com';
const DB = createLocalDb();
const env = {DB};
const post = (path, body, headers = {}) => worker.fetch(new Request(`${origin}${path}`, {
  method: 'POST',
  headers: {'content-type': 'application/json', origin, 'cf-connecting-ip': '198.51.100.7', ...headers},
  body: JSON.stringify(body),
}), env, {});
const rows = async sql => (await DB.prepare(sql).all()).results;

// Newsletter: valid emails are stored once, lower-cased.
let response = await post('/api/subscribe', {email: 'Shopper@Example.com', source: 'footer'});
assert.equal(response.status, 200);
assert.equal((await response.json()).ok, true);
await post('/api/subscribe', {email: 'shopper@example.com'});
assert.deepEqual((await rows('SELECT email, source FROM subscribers')), [{email: 'shopper@example.com', source: 'footer'}]);
assert.equal((await post('/api/subscribe', {email: 'not-an-email'})).status, 400);
assert.equal((await post('/api/subscribe', {email: 'a@b.co'}, {origin: 'https://evil.example'})).status, 403);

// The hidden "company" field silently drops bot submissions.
response = await post('/api/subscribe', {email: 'bot@spam.example', company: 'Spam Inc'});
assert.equal(response.status, 200);
assert.equal((await rows("SELECT * FROM subscribers WHERE email = 'bot@spam.example'")).length, 0);

// Contact: stores a message, validates required fields.
response = await post('/api/contact', {name: 'Asha', email: 'asha@example.com', phone: '+91 98765 43210', order: '#1002', message: 'Can I exchange my size?'});
assert.equal(response.status, 200);
const [message] = await rows('SELECT name, email, phone, order_number, message FROM contact_messages');
assert.deepEqual(message, {name: 'Asha', email: 'asha@example.com', phone: '+91 98765 43210', order_number: '#1002', message: 'Can I exchange my size?'});
assert.equal((await post('/api/contact', {name: '', email: 'asha@example.com', message: 'Hello there'})).status, 400);
assert.equal((await post('/api/contact', {name: 'Asha', email: 'asha@example.com', message: 'Hi'})).status, 400);

// Each visitor gets at most 10 form submissions per day.
const limited = {'cf-connecting-ip': '203.0.113.50'};
for (let i = 0; i < 10; i++) assert.equal((await post('/api/subscribe', {email: `limit${i}@example.com`}, limited)).status, 200);
assert.equal((await post('/api/subscribe', {email: 'limit10@example.com'}, limited)).status, 429);

// Without a database binding, forms fail gracefully.
const noDb = await worker.fetch(new Request(`${origin}/api/contact`, {method: 'POST', headers: {'content-type': 'application/json', origin}, body: '{}'}), {}, {});
assert.equal(noDb.status, 503);

// SEO, analytics and caching on generated pages.
const get = path => worker.fetch(new Request(`${origin}${path}`), env, {});
const product = await get('/products/aria-dusk-dress/');
const page = await product.text();
assert.equal(product.headers.get('cache-control'), 'no-cache');
assert.match(page, /<link rel="canonical" href="https:\/\/myruchs\.com\/products\/aria-dusk-dress\/">/);
assert.match(page, /<meta property="og:image" content="https:\/\/myruchs\.com\/catalog\/[^"]+\.webp">/);
assert.match(page, /gtag\('config','G-M0EHDZSDPJ'\)/);
assert.match(page, /fbq\('init','1412294113670313'\)/);
const data = JSON.parse(page.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
assert.equal(data['@type'], 'Product');
assert.equal(data.offers[0].priceCurrency, 'INR');
const script = page.match(/src="(\/remap\.js\?v=[a-f0-9]+)"/)[1];
assert.equal((await get(script)).headers.get('cache-control'), 'public, max-age=31536000, immutable');
assert.match(await (await get('/search/')).text(), /<meta name="robots" content="noindex, follow">/);
const sitemap = await (await get('/sitemap.xml')).text();
assert.match(sitemap, /<loc>https:\/\/myruchs\.com\/products\/aria-dusk-dress\/<\/loc>/);
assert.doesNotMatch(sitemap, /\/search\//);
assert.match(await (await get('/robots.txt')).text(), /Sitemap: https:\/\/myruchs\.com\/sitemap\.xml/);
assert.equal((await get('/favicon.ico')).headers.get('location'), `${origin}/showcase/ruchs-icon.png`);

// Try-on limits can be raised through Worker variables.
const status = env => worker.fetch(new Request(`${origin}/api/try-on/status`), env, {});
const quotaDb = createLocalDb();
await quotaDb.prepare("INSERT INTO tryon_quota (day, scope, subject, count) VALUES (?, 'global', 'all', 5)").bind(new Date().toISOString().slice(0, 10)).run();
assert.equal((await (await status({DB: quotaDb, GENLOOK_API_KEY: 'k'})).json()).available, false);
assert.equal((await (await status({DB: quotaDb, GENLOOK_API_KEY: 'k', TRYON_DAILY_LIMIT: '20'})).json()).available, true);

console.log('Forms, SEO, caching and try-on limit settings passed');

// Unknown addresses get the branded page with a real 404 status, kept out of search.
const missing = await worker.fetch(new Request(`${origin}/products/not-a-real-dress/`), {}, {});
assert.equal(missing.status, 404);
assert.equal(missing.headers.get('x-robots-tag'), 'noindex');
const missingHtml = await missing.text();
assert.match(missingHtml, /We couldn’t find that page/);
assert.match(missingHtml, /href="\/collections\/all\/"/);
assert.doesNotMatch(await (await worker.fetch(new Request(`${origin}/sitemap.xml`), {}, {})).text(), /\/404\//);
console.log('Branded 404 page passed');
