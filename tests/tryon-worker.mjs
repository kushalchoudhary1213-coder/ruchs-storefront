import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';

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
  const status = await worker.fetch(new Request('https://site.test/api/try-on/status'), {GENLOOK_API_KEY: 'test-server-key'});
  assert.deepEqual(await status.json(), {available: true});
  const body = new FormData();
  body.append('handle', 'angelic-cinderella-dress');
  body.append('image_index', '1');
  body.append('person', new File([new Uint8Array(1200)], 'person.jpg', {type: 'image/jpeg'}));
  const request = new Request('https://site.test/api/try-on', {method: 'POST', body});
  const result = await worker.fetch(request, {GENLOOK_API_KEY: 'test-server-key'});
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('content-type'), 'image/png');
  assert.equal((await result.arrayBuffer()).byteLength, 6);
  assert.equal(seen.length, 3);

  const invalid = new FormData();
  invalid.append('handle', 'unknown-product');
  invalid.append('person', new File([new Uint8Array(1200)], 'person.jpg', {type: 'image/jpeg'}));
  const rejected = await worker.fetch(new Request('https://site.test/api/try-on', {method: 'POST', body: invalid}), {GENLOOK_API_KEY: 'test-server-key'});
  assert.equal(rejected.status, 400);
  assert.equal(seen.length, 3);
  console.log('Try-on Worker: valid image response, provider payload, and invalid product rejection passed');
} finally {
  globalThis.fetch = originalFetch;
}
