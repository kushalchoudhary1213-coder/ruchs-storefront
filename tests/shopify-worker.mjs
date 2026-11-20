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
assert.deepEqual(data, {url: `https://www.ruchs.in/cart/${variant}:1?ref=myruchs`, mode: 'permalink'});
calls.length = 0;
data = await (await checkout([{id: variant, quantity: 50}])).json();
assert.deepEqual(data, {url: `https://www.ruchs.in/cart/${variant}:10?ref=myruchs`, mode: 'permalink'});
assert.equal(calls.length, 0);

// Shiprocket: without keys, Buy now opens the ruchs.in cart page (Shiprocket BUY NOW).
const shiprocketCheckout = (lines, env) => worker.fetch(new Request(`${origin}/api/checkout`, {
  method: 'POST', headers: {'content-type': 'application/json', origin},
  body: JSON.stringify({provider: 'shiprocket', lines}),
}), env, {});
const cartPage = `https://www.ruchs.in/cart/${variant}:2?storefront=true&ref=myruchs`;
data = await (await shiprocketCheckout([{id: variant, quantity: 2}], env)).json();
assert.deepEqual(data, {url: cartPage, mode: 'shiprocket-cart'});
assert.equal(calls.length, 0);

// With keys, the Worker returns a signed Shiprocket headless checkout token.
const shiprocketEnv = {...env, SHIPROCKET_CHECKOUT_API_KEY: 'sr-key', SHIPROCKET_CHECKOUT_SECRET: 'sr-secret'};
let shiprocket = {status: 200, body: {result: {token: 'sr-checkout-token'}}};
const shopifyFetch = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
  if (String(input) !== 'https://checkout-api.shiprocket.com/api/v1/access-token/checkout') return shopifyFetch(input, options);
  calls.push({url: String(input), options});
  return new Response(JSON.stringify(shiprocket.body), {status: shiprocket.status});
};
data = await (await shiprocketCheckout([{id: variant, quantity: 2}], shiprocketEnv)).json();
assert.deepEqual(data, {token: 'sr-checkout-token', fallbackUrl: cartPage, mode: 'shiprocket'});
const signed = calls.at(-1);
const signedBody = JSON.parse(signed.options.body);
assert.deepEqual(signedBody.cart_data.items, [{variant_id: variant, quantity: 2}]);
assert.equal(signedBody.redirect_url, `${origin}/?checkout=complete`);
const {createHmac} = await import('node:crypto');
assert.equal(signed.options.headers['X-Api-Key'], 'sr-key');
assert.equal(signed.options.headers['X-Api-HMAC-SHA256'], createHmac('sha256', 'sr-secret').update(signed.options.body).digest('base64'));
// If Shiprocket refuses the token, Buy now still opens the ruchs.in cart page.
shiprocket = {status: 401, body: {}};
data = await (await shiprocketCheckout([{id: variant, quantity: 2}], shiprocketEnv)).json();
assert.deepEqual(data, {url: cartPage, mode: 'shiprocket-cart'});
globalThis.fetch = shopifyFetch;
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
