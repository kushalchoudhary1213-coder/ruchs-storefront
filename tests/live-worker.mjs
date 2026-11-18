import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
import {createLocalQuotaDb} from '../scripts/local_quota.mjs';

const origin = 'https://ruchs.test';
const originalFetch = globalThis.fetch;
let providerStatus = 200;
let tokenCalls = 0;
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.startsWith('https://cdn.shopify.com/')) {
    return new Response(new Uint8Array([137, 80, 78, 71, 1, 2]), {headers: {'content-type': 'image/png'}});
  }
  if (url === 'https://api.decart.ai/v1/client/tokens') {
    tokenCalls += 1;
    assert.equal(options.headers['x-api-key'], 'test-decart-secret');
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload.allowedModels, ['lucy-vton-3.6']);
    assert.deepEqual(payload.allowedOrigins, [origin]);
    assert.equal(payload.constraints.realtime.maxSessionDuration, 30);
    return providerStatus === 200
      ? Response.json({apiKey: 'short-lived-test-token'})
      : new Response('Unavailable', {status: providerStatus});
  }
  throw new Error(`Unexpected request: ${url}`);
};

try {
  const env = {DECART_API_KEY: 'test-decart-secret', DB: createLocalQuotaDb()};
  const statusFor = (ip) => new Request(`${origin}/api/live/status`, {headers: {'CF-Connecting-IP': ip}});
  const tokenFor = (ip, handle = 'angelic-cinderella-dress', requestOrigin = origin) => new Request(`${origin}/api/live/token`, {
    method: 'POST',
    headers: {'origin': requestOrigin, 'content-type': 'application/json', 'CF-Connecting-IP': ip},
    body: JSON.stringify({handle}),
  });

  assert.equal((await worker.fetch(statusFor('192.0.2.1'), env)).status, 200);
  assert.equal((await (await worker.fetch(statusFor('192.0.2.1'), env)).json()).available, true);
  const garment = await worker.fetch(new Request(`${origin}/api/live/garment?handle=angelic-cinderella-dress&image_index=0`), env);
  assert.equal(garment.status, 200);
  assert.equal(garment.headers.get('content-type'), 'image/png');
  assert.equal((await worker.fetch(new Request(`${origin}/api/live/garment?handle=unknown&image_index=0`), env)).status, 400);
  assert.equal((await worker.fetch(tokenFor('192.0.2.1', 'angelic-cinderella-dress', 'https://other.test'), env)).status, 403);
  assert.equal((await worker.fetch(tokenFor('192.0.2.1', 'unknown'), env)).status, 400);
  const token = await worker.fetch(tokenFor('192.0.2.1'), env);
  assert.equal(token.status, 200);
  assert.deepEqual(await token.json(), {apiKey: 'short-lived-test-token', maxSessionSeconds: 30});
  assert.equal((await worker.fetch(tokenFor('192.0.2.1'), env)).status, 200);
  assert.equal((await worker.fetch(tokenFor('192.0.2.1'), env)).status, 429);
  assert.equal((await (await worker.fetch(statusFor('192.0.2.1'), env)).json()).available, false);
  assert.equal(tokenCalls, 2);

  providerStatus = 402;
  const failedEnv = {DECART_API_KEY: 'test-decart-secret', DB: createLocalQuotaDb()};
  const failed = await worker.fetch(tokenFor('192.0.2.2'), failedEnv);
  assert.equal(failed.status, 503);
  assert.match((await failed.json()).error, /credits/);
  assert.equal((await (await worker.fetch(statusFor('192.0.2.2'), failedEnv)).json()).available, true);
  console.log('Live Worker: scoped token, garment proxy, origin check, quotas, and provider refund passed');
} finally {
  globalThis.fetch = originalFetch;
}
