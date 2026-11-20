import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';

const variant = '53809149280628';
const origin = 'https://myruchs.com';
let shopify = {status: 200, body: null};
const calls = [];
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  calls.push({url, options});
  if (url.startsWith('https://frkcn3-hp.myshopify.com/api/')) {
    return new Response(JSON.stringify(shopify.body), {status: shopify.status, headers: {'content-type': 'application/json'}});
  }
  throw new Error(`unexpected fetch ${url}`);
};

const checkout = (lines, env = {}, headers = {origin}) => worker.fetch(new Request(`${origin}/api/checkout`, {
  method: 'POST', headers: {'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9', ...headers},
  body: JSON.stringify({lines}),
}), env, {});
const env = {SHOPIFY_STOREFRONT_TOKEN: 'test-private-token'};

// The Storefront API creates the Shopify cart and returns its checkout URL.
shopify = {status: 200, body: {data: {cartCreate: {cart: {checkoutUrl: 'https://www.ruchs.in/cart/c/abc?key=1'}, userErrors: []}}}};
let response = await checkout([{id: Number(variant), quantity: 2}, {id: variant, quantity: 1}], env);
assert.equal(response.status, 200);
let data = await response.json();
assert.deepEqual(data, {url: 'https://www.ruchs.in/cart/c/abc?key=1', mode: 'storefront'});
const sent = calls.at(-1);
assert.equal(sent.options.headers['Shopify-Storefront-Private-Token'], 'test-private-token');
assert.equal(sent.options.headers['Shopify-Storefront-Buyer-IP'], '203.0.113.9');
assert.deepEqual(JSON.parse(sent.options.body).variables.lines, [{merchandiseId: `gid://shopify/ProductVariant/${variant}`, quantity: 3}]);

// Shopify user errors (for example sold out) are shown to the shopper.
shopify = {status: 200, body: {data: {cartCreate: {cart: null, userErrors: [{field: ['lines'], message: 'This item is sold out.'}]}}}};
response = await checkout([{id: variant, quantity: 1}], env);
assert.equal(response.status, 409);
assert.equal((await response.json()).error, 'This item is sold out.');

// If the Storefront API fails, or no token is set, a Shopify cart permalink is used.
shopify = {status: 500, body: {}};
data = await (await checkout([{id: variant, quantity: 1}], env)).json();
assert.deepEqual(data, {url: `https://checkout.myruchs.com/cart/${variant}:1?ref=myruchs`, mode: 'permalink'});
calls.length = 0;
data = await (await checkout([{id: variant, quantity: 50}])).json();
assert.deepEqual(data, {url: `https://checkout.myruchs.com/cart/${variant}:10?ref=myruchs`, mode: 'permalink'});
assert.equal(calls.length, 0);

// A stale page still sending provider "shiprocket" gets the Shopify checkout.
shopify = {status: 200, body: {data: {cartCreate: {cart: {checkoutUrl: 'https://www.ruchs.in/cart/c/def?key=2'}, userErrors: []}}}};
data = await (await worker.fetch(new Request(`${origin}/api/checkout`, {
  method: 'POST', headers: {'content-type': 'application/json', origin},
  body: JSON.stringify({provider: 'shiprocket', lines: [{id: variant, quantity: 1}]}),
}), env, {})).json();
assert.deepEqual(data, {url: 'https://www.ruchs.in/cart/c/def?key=2', mode: 'storefront'});
assert.ok(!calls.some(call => call.url.includes('shiprocket')));
calls.length = 0;

// Requests from other origins, unknown variants and bad quantities are refused.
assert.equal((await checkout([{id: variant, quantity: 1}], env, {origin: 'https://evil.example'})).status, 403);
assert.equal((await checkout([{id: '123', quantity: 1}], env)).status, 400);
assert.equal((await checkout([{id: variant, quantity: 0}], env)).status, 400);
assert.equal((await checkout([], env)).status, 400);

// Inventory: off without a token, live and filtered to known variants with one.
data = await (await worker.fetch(new Request(`${origin}/api/inventory`), {}, {})).json();
assert.deepEqual(data, {live: false, variants: {}});
shopify = {status: 200, body: {data: {products: {pageInfo: {hasNextPage: false, endCursor: null}, nodes: [{handle: 'x', variants: {nodes: [
  {id: `gid://shopify/ProductVariant/${variant}`, availableForSale: false, price: {amount: '5499.0'}, compareAtPrice: {amount: '5799.0'}},
  {id: 'gid://shopify/ProductVariant/1', availableForSale: true, price: {amount: '1.0'}, compareAtPrice: null},
]}}]}}}};
data = await (await worker.fetch(new Request(`${origin}/api/inventory`), env, {})).json();
assert.deepEqual(data, {live: true, variants: {[variant]: {available: false, price: '5499.0', compareAtPrice: '5799.0'}}});

console.log('Shopify Worker: Storefront checkout, sold-out errors, permalink fallback, validation and live inventory passed');

// Legacy ruchs.in paths redirect to their myruchs.com equivalents.
const get = path => worker.fetch(new Request(`${origin}${path}`), {}, {});
for (const [from, to] of [['/cart', '/'], ['/cart/', '/'], ['/products', '/collections/all/'], ['/blogs', '/blogs/news/']]) {
  const redirect = await get(from);
  assert.equal(redirect.status, 301, from);
  assert.equal(redirect.headers.get('location'), `${origin}${to}`, from);
}
for (const path of ['/account', '/account/login', '/account/orders/123']) {
  assert.equal((await get(path)).headers.get('location'), 'https://shopify.com/93998121332/account', path);
}
assert.equal((await get('/cdn/shop/files/a.png')).headers.get('location'), 'https://checkout.myruchs.com/cdn/shop/files/a.png');
assert.equal((await get('/products/aria-dusk-dress/')).status, 200);
console.log('Legacy redirects: cart, products, blogs, account and cdn passed');
