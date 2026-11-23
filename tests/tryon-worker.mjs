import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {createLocalQuotaDb} from '../scripts/local_quota.mjs';

const originalFetch = globalThis.fetch;
const seen = [];
let providerStatus = 200;
let lastPayload = null;
let lastForm = null;
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  seen.push(url);
  if (url.startsWith('https://cdn.shopify.com/')) {
    return new Response(new Uint8Array([137, 80, 78, 71, 1, 2]), {headers: {'content-type': 'image/png'}});
  }
  if (url.endsWith('/try-on/sync')) {
    if (providerStatus === 402) return new Response('Payment required', {status: 402});
    assert.equal(options.headers['x-api-key'], 'test-server-key');
    const data = JSON.parse(options.body.get('data'));
    lastPayload = data;
    lastForm = options.body;
    assert.equal(data.products[0].images[0].classifications.on_model, 'true');
    assert.equal(data.products[0].images[1]?.classifications, undefined);
    assert.equal(data.output.keepForDays, 1);
    assert.equal(data.output.resolution, '2k');
    data.products[0].images.forEach(image => assert.ok(options.body.get(image.source.fileKey) instanceof File));
    assert.equal(options.body.get('person').type, 'image/jpeg');
    return Response.json({resultImageUrl: 'https://signed.example/result.png'});
  }
  if (url === 'https://signed.example/result.png') {
    return new Response(new Uint8Array([137, 80, 78, 71, 3, 4]), {headers: {'content-type': 'image/png'}});
  }
  throw new Error(`Unexpected request: ${url}`);
};

try {
  const env = {GENLOOK_API_KEY: 'test-server-key', DB: createLocalQuotaDb()};
  const status = await worker.fetch(new Request('https://site.test/api/try-on/status'), env);
  assert.deepEqual(await status.json(), {available: true, reason: null});
  const requestFor = (ip, handle = 'angelic-cinderella-dress') => {
    const body = new FormData();
    body.append('handle', handle);
    body.append('image_index', '1');
    body.append('person', new File([new Uint8Array(1200)], 'person.jpg', {type: 'image/jpeg'}));
    return new Request('https://site.test/api/try-on', {method: 'POST', headers: {'CF-Connecting-IP': ip}, body});
  };
  const result = await worker.fetch(requestFor('192.0.2.1'), env);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('content-type'), 'image/png');
  assert.equal((await result.arrayBuffer()).byteLength, 6);
  // Four product photos (chosen one first), the provider call and the result download.
  const perPreview = 6;
  assert.equal(seen.length, perPreview);
  assert.equal(seen.filter(url => url.startsWith('https://cdn.shopify.com/')).length, 4);
  assert.equal(lastPayload.products[0].images.length, 4);
  assert.match(lastPayload.products[0].description, /Angelic Cinderella Dress/);
  assert.match(lastPayload.products[0].description, /Preserve its colour/);

  const rejected = await worker.fetch(requestFor('192.0.2.1', 'unknown-product'), env);
  assert.equal(rejected.status, 400);
  assert.equal(seen.length, perPreview);
  assert.equal((await worker.fetch(requestFor('192.0.2.1'), env)).status, 200);
  assert.equal((await worker.fetch(requestFor('192.0.2.1'), env)).status, 429);
  for (let i = 2; i <= 4; i++) assert.equal((await worker.fetch(requestFor(`192.0.2.${i}`), env)).status, 200);
  assert.equal((await worker.fetch(requestFor('192.0.2.5'), env)).status, 429);
  assert.equal(seen.length, perPreview * 5);

  // Colour previews: the browser sends recoloured garment photos; no product photos are fetched.
  const colourEnv = {GENLOOK_API_KEY: 'test-server-key', DB: createLocalQuotaDb()};
  const colourRequest = (ip, colour, garments) => {
    const body = new FormData();
    body.append('handle', 'luna-burgundy-jumpsuit');
    body.append('image_index', '0');
    body.append('person', new File([new Uint8Array(1200)], 'person.jpg', {type: 'image/jpeg'}));
    if (colour) body.append('colour', colour);
    for (let i = 0; i < garments; i++) body.append('garment', new File([new Uint8Array(2000)], `garment-${i}.jpg`, {type: 'image/jpeg'}));
    return new Request('https://site.test/api/try-on', {method: 'POST', headers: {'CF-Connecting-IP': ip}, body});
  };
  const before = seen.length;
  const coloured = await worker.fetch(colourRequest('198.51.100.1', 'emerald', 2), colourEnv);
  assert.equal(coloured.status, 200);
  assert.equal(seen.slice(before).filter(url => url.startsWith('https://cdn.shopify.com/')).length, 0);
  assert.equal(lastPayload.products[0].images.length, 2);
  assert.match(lastPayload.products[0].description, /emerald green as a colour preview/);
  assert.equal(lastForm.get('product1').size, 2000);
  assert.equal((await worker.fetch(colourRequest('198.51.100.2', 'neon', 1), colourEnv)).status, 400);
  assert.equal((await worker.fetch(colourRequest('198.51.100.2', 'wine', 0), colourEnv)).status, 400);
  assert.equal((await worker.fetch(colourRequest('198.51.100.2', 'wine', 4), colourEnv)).status, 400);
  assert.equal((await worker.fetch(colourRequest('198.51.100.2', '', 1), colourEnv)).status, 400);
  const full = await worker.fetch(new Request('https://site.test/api/try-on/status'), env);
  assert.equal((await full.json()).available, false);

  providerStatus = 402;
  const creditEnv = {GENLOOK_API_KEY: 'test-server-key', DB: createLocalQuotaDb()};
  const creditFailure = await worker.fetch(requestFor('192.0.2.10'), creditEnv);
  assert.equal(creditFailure.status, 503);
  assert.match((await creditFailure.json()).error, /Genlook credits/);
  const day = new Date().toISOString().slice(0, 10);
  const globalCount = await creditEnv.DB.prepare('SELECT count FROM tryon_quota WHERE day = ? AND scope = ? AND subject = ?')
    .bind(day, 'global', 'all').first();
  assert.equal(globalCount.count, 0);
  const paused = await worker.fetch(new Request('https://site.test/api/try-on/status'), creditEnv);
  assert.equal((await paused.json()).available, false);
  assert.equal((await worker.fetch(requestFor('192.0.2.10'), creditEnv)).status, 503);
  console.log('Try-on Worker: provider payload, product photos, colour previews, quotas, and payment pause passed');
} finally {
  globalThis.fetch = originalFetch;
}
