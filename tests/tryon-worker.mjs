import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {createLocalQuotaDb} from '../scripts/local_quota.mjs';

const originalFetch = globalThis.fetch;
const seen = [];
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  seen.push(url);
  if (url.startsWith('https://cdn.shopify.com/')) {
    return new Response(new Uint8Array([137, 80, 78, 71, 1, 2]), {headers: {'content-type': 'image/png'}});
  }
  if (url.endsWith('/try-on/sync')) {
    assert.equal(options.headers['x-api-key'], 'test-server-key');
    const data = JSON.parse(options.body.get('data'));
    assert.equal(data.products[0].images[0].classifications.on_model, 'true');
    assert.equal(data.output.keepForDays, 1);
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
  assert.equal(seen.length, 3);

  const rejected = await worker.fetch(requestFor('192.0.2.1', 'unknown-product'), env);
  assert.equal(rejected.status, 400);
  assert.equal(seen.length, 3);
  assert.equal((await worker.fetch(requestFor('192.0.2.1'), env)).status, 200);
  assert.equal((await worker.fetch(requestFor('192.0.2.1'), env)).status, 429);
  for (let i = 2; i <= 4; i++) assert.equal((await worker.fetch(requestFor(`192.0.2.${i}`), env)).status, 200);
  assert.equal((await worker.fetch(requestFor('192.0.2.5'), env)).status, 429);
  assert.equal(seen.length, 15);
  const full = await worker.fetch(new Request('https://site.test/api/try-on/status'), env);
  assert.equal((await full.json()).available, false);
  console.log('Try-on Worker: provider payload, invalid product, visitor cap, and daily cap passed');
} finally {
  globalThis.fetch = originalFetch;
}
