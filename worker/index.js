const providerBase = 'https://api.genlook.app/tryon/v1';
const noStore = {'cache-control': 'no-store'};
const dailyLimit = 5;
const visitorLimit = 2;
const providerPauseMinutes = 15;
const providerUnavailableMessage = 'Virtual try-on is paused until Genlook credits are available.';
const liveModel = 'lucy-vton-3.6';
const liveSessionSeconds = 30;
const liveDailyLimit = 5;
const liveVisitorLimit = 2;

// Shopify backend for ruchs.in. Checkout always works through Shopify cart
// permalinks; with SHOPIFY_STOREFRONT_TOKEN set, carts are created through the
// Storefront API and live stock and prices are served from /api/inventory.
const shopifyStoreDomain = 'frkcn3-hp.myshopify.com';
const shopifyStorefrontDomain = 'www.ruchs.in';
const shopifyDefaultApiVersion = '2026-04';
const maxCartLines = 20;
const maxLineQuantity = 10;
const inventoryCacheSeconds = 60;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {'content-type': 'application/json; charset=utf-8', ...noStore},
  });
}

async function timedFetch(url, options = {}, milliseconds = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try {
    return await fetch(url, {...options, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

function garmentTitle(product) {
  const type = (product.type || '').toLowerCase();
  if (type.includes('set') || type.includes('piece') || product.handle.includes('set')) return 'Coordinated outfit';
  if (type.includes('jumpsuit')) return 'Jumpsuit';
  return 'Dress';
}

async function reserveQuota(db, day, scope, subject, limit) {
  const row = await db.prepare(`
    INSERT INTO tryon_quota (day, scope, subject, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(day, scope, subject) DO UPDATE SET count = tryon_quota.count + 1
    WHERE tryon_quota.count < ? RETURNING count
  `).bind(day, scope, subject, limit).first();
  return !!row;
}

async function refundQuota(db, day, scope, subject) {
  await db.prepare('UPDATE tryon_quota SET count = MAX(0, count - 1) WHERE day = ? AND scope = ? AND subject = ?')
    .bind(day, scope, subject).run();
}

async function providerPaused(db, day) {
  const row = await db.prepare('SELECT count FROM tryon_quota WHERE day = ? AND scope = ? AND subject = ?')
    .bind(day, 'provider', 'genlook').first();
  return Number(row?.count || 0) > Math.floor(Date.now() / 60000);
}

async function pauseProvider(db, day) {
  const until = Math.floor(Date.now() / 60000) + providerPauseMinutes;
  await db.prepare(`
    INSERT INTO tryon_quota (day, scope, subject, count) VALUES (?, 'provider', 'genlook', ?)
    ON CONFLICT(day, scope, subject) DO UPDATE SET count = excluded.count
  `).bind(day, until).run();
}

async function visitorHash(request, key, day) {
  const identity = request.headers.get('oai-authenticated-user-id') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const bytes = new TextEncoder().encode(`${key}:${day}:${identity}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function liveStatus(request, env) {
  if (!env.DECART_API_KEY || !env.DB) return json({available: false, reason: 'Live try-on is unavailable right now.'});
  try {
    const day = new Date().toISOString().slice(0, 10);
    const visitor = await visitorHash(request, env.DECART_API_KEY, day);
    const global = await env.DB.prepare('SELECT count FROM tryon_quota WHERE day = ? AND scope = ? AND subject = ?')
      .bind(day, 'live-global', 'all').first();
    const individual = await env.DB.prepare('SELECT count FROM tryon_quota WHERE day = ? AND scope = ? AND subject = ?')
      .bind(day, 'live-visitor', visitor).first();
    if (Number(global?.count || 0) >= liveDailyLimit) {
      return json({available: false, reason: 'Today’s live previews are full. Please try again tomorrow.'});
    }
    if (Number(individual?.count || 0) >= liveVisitorLimit) {
      return json({available: false, reason: 'You have used today’s live previews. Please try again tomorrow.'});
    }
    return json({available: true, reason: null, maxSessionSeconds: liveSessionSeconds});
  } catch {
    return json({available: false, reason: 'Live try-on is unavailable right now.'});
  }
}

async function liveGarment(request) {
  const url = new URL(request.url);
  const product = productImages[url.searchParams.get('handle')];
  const index = Number(url.searchParams.get('image_index'));
  if (!product || !Number.isInteger(index) || index < 0 || index >= product.images.length) {
    return json({error: 'Choose a valid product photo.'}, 400);
  }
  try {
    const source = new URL(product.images[index]);
    if (source.protocol !== 'https:' || source.hostname !== 'cdn.shopify.com') throw new Error('invalid-garment-url');
    const response = await timedFetch(source, {}, 20000);
    if (!response.ok) throw new Error('garment-unavailable');
    const type = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new Error('invalid-garment-type');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 5_000_000) return json({error: 'This product photo is too large for live try-on.'}, 413);
    return new Response(bytes, {headers: {'content-type': type, 'cache-control': 'public, max-age=3600'}});
  } catch (error) {
    console.error('Live garment unavailable', error?.message || 'unknown');
    return json({error: 'Could not load this product photo.'}, 502);
  }
}

async function createLiveToken(request, env) {
  if (!env.DECART_API_KEY || !env.DB) return json({error: 'Live try-on is unavailable right now.'}, 503);
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin) return json({error: 'This request must come from the storefront.'}, 403);
  let fields;
  try { fields = await request.json(); }
  catch { return json({error: 'Choose a valid product.'}, 400); }
  if (!productImages[fields?.handle]) return json({error: 'Choose a valid product.'}, 400);

  const day = new Date().toISOString().slice(0, 10);
  let visitor;
  try {
    visitor = await visitorHash(request, env.DECART_API_KEY, day);
    if (!await reserveQuota(env.DB, day, 'live-visitor', visitor, liveVisitorLimit)) {
      return json({error: 'You have used today’s live previews. Please try again tomorrow.'}, 429);
    }
    if (!await reserveQuota(env.DB, day, 'live-global', 'all', liveDailyLimit)) {
      await refundQuota(env.DB, day, 'live-visitor', visitor);
      return json({error: 'Today’s live previews are full. Please try again tomorrow.'}, 429);
    }
  } catch (error) {
    console.error('Live quota unavailable', error?.message || 'unknown');
    return json({error: 'Live try-on is unavailable right now.'}, 503);
  }

  try {
    const response = await timedFetch('https://api.decart.ai/v1/client/tokens', {
      method: 'POST',
      headers: {'x-api-key': env.DECART_API_KEY, 'content-type': 'application/json'},
      body: JSON.stringify({
        expiresIn: 30,
        allowedModels: [liveModel],
        allowedOrigins: [origin],
        constraints: {realtime: {maxSessionDuration: liveSessionSeconds}},
      }),
    }, 20000);
    if (!response.ok) {
      console.error('Decart token status', response.status);
      await refundQuota(env.DB, day, 'live-visitor', visitor);
      await refundQuota(env.DB, day, 'live-global', 'all');
      const message = response.status === 402 ? 'Decart credits are unavailable right now.'
        : response.status === 401 || response.status === 403 ? 'The Decart key could not authorize live try-on.'
        : 'Could not start live try-on. Please try again.';
      return json({error: message}, 503);
    }
    const data = await response.json();
    const apiKey = data.apiKey || data.token;
    if (typeof apiKey !== 'string' || !apiKey) throw new Error('invalid-client-token');
    return json({apiKey, maxSessionSeconds: liveSessionSeconds});
  } catch (error) {
    console.error('Decart token unavailable', error?.message || 'unknown');
    await refundQuota(env.DB, day, 'live-visitor', visitor).catch(() => {});
    await refundQuota(env.DB, day, 'live-global', 'all').catch(() => {});
    return json({error: 'Could not start live try-on. Please try again.'}, 502);
  }
}

async function tryOn(request, env) {
  if (!env.GENLOOK_API_KEY || !env.DB) return json({error: 'Try-on is unavailable right now.'}, 503);
  const day = new Date().toISOString().slice(0, 10);
  try {
    if (await providerPaused(env.DB, day)) return json({error: providerUnavailableMessage}, 503);
  } catch {
    return json({error: 'Try-on is unavailable right now.'}, 503);
  }
  if (Number(request.headers.get('content-length') || 0) > 3_500_000) {
    return json({error: 'Please choose a smaller photo.'}, 413);
  }

  let fields;
  try { fields = await request.formData(); }
  catch { return json({error: 'Could not read the uploaded photo.'}, 400); }
  const person = fields.get('person');
  const handle = fields.get('handle');
  const imageIndex = Number(fields.get('image_index') || 0);
  const product = productImages[handle];
  if (!(person instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(person.type) || person.size > 2_800_000 || person.size < 1000) {
    return json({error: 'Choose a valid JPG, PNG or WebP photo.'}, 400);
  }
  if (!product || !Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex >= product.images.length) {
    return json({error: 'Choose a valid product photo.'}, 400);
  }

  let visitor;
  try {
    visitor = await visitorHash(request, env.GENLOOK_API_KEY, day);
    if (!await reserveQuota(env.DB, day, 'visitor', visitor, visitorLimit)) {
      return json({error: 'You have used today’s try-on previews. Please try again tomorrow.'}, 429);
    }
    if (!await reserveQuota(env.DB, day, 'global', 'all', dailyLimit)) {
      await refundQuota(env.DB, day, 'visitor', visitor);
      return json({error: 'Today’s try-on previews are full. Please try again tomorrow.'}, 429);
    }
  } catch (error) {
    console.error('Try-on quota unavailable', error?.message || 'unknown');
    return json({error: 'Try-on is unavailable right now.'}, 503);
  }

  try {
    const garmentUrl = new URL(product.images[imageIndex]);
    if (garmentUrl.protocol !== 'https:' || garmentUrl.hostname !== 'cdn.shopify.com') throw new Error('invalid-garment-url');
    const garmentResponse = await timedFetch(garmentUrl, {}, 20000);
    if (!garmentResponse.ok) throw new Error('garment-unavailable');
    const garmentBytes = await garmentResponse.arrayBuffer();
    if (garmentBytes.byteLength > 8_000_000) return json({error: 'This product photo is too large for try-on.'}, 413);
    const garmentType = garmentResponse.headers.get('content-type')?.split(';')[0] || 'image/png';
    if (!garmentType.startsWith('image/')) throw new Error('invalid-garment-image');

    const kind = garmentTitle(product);
    const payload = {
      products: [{
        title: kind,
        description: `Exact ${kind.toLowerCase()} from a worn-model reference. Preserve its colour, print, material, cut, sleeves, seams, and hem.`,
        images: [{source: {fileKey: 'product'}, classifications: {on_model: 'true'}}],
      }],
      person: {image: {source: {fileKey: 'person'}}},
      output: {resolution: 'default', keepForDays: 1},
    };
    const form = new FormData();
    form.append('data', JSON.stringify(payload));
    form.append('person', person, 'person.jpg');
    form.append('product', new File([garmentBytes], 'product-image', {type: garmentType}));
    const headers = {'x-api-key': env.GENLOOK_API_KEY};
    const response = await timedFetch(`${providerBase}/try-on/sync`, {method: 'POST', headers, body: form}, 110000);
    if (response.status === 402) {
      await Promise.all([
        refundQuota(env.DB, day, 'visitor', visitor),
        refundQuota(env.DB, day, 'global', 'all'),
        pauseProvider(env.DB, day),
      ]);
      return json({error: providerUnavailableMessage}, 503);
    }
    if (![200, 201, 202].includes(response.status)) {
      console.error('Genlook try-on status', response.status);
      return json({error: 'Could not create your preview. Please try again.'}, 502);
    }
    let generation = await response.json();
    if (response.status === 202) {
      const id = generation.generationId;
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('missing-generation-id');
      const deadline = Date.now() + 100000;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const poll = await timedFetch(`${providerBase}/generations/${id}`, {headers}, 20000);
        if (!poll.ok) throw new Error(`generation-status-${poll.status}`);
        generation = await poll.json();
        if (generation.status === 'COMPLETED') break;
        if (generation.status === 'FAILED') throw new Error('generation-failed');
      }
    }
    if (!generation.resultImageUrl) throw new Error('missing-result');
    const resultUrl = new URL(generation.resultImageUrl);
    if (resultUrl.protocol !== 'https:') throw new Error('invalid-result-url');
    const imageResponse = await timedFetch(resultUrl, {}, 25000);
    if (!imageResponse.ok) throw new Error('result-download-failed');
    const image = await imageResponse.arrayBuffer();
    if (image.byteLength > 10_000_000) throw new Error('result-too-large');
    const imageType = imageResponse.headers.get('content-type')?.split(';')[0] || 'image/png';
    if (!imageType.startsWith('image/')) throw new Error('invalid-result-image');
    return new Response(image, {headers: {'content-type': imageType, ...noStore}});
  } catch (error) {
    console.error('Virtual try-on failed', error?.message || 'unknown');
    return json({error: 'Could not create your preview. Please try again.'}, 502);
  }
}

function cartLines(value) {
  if (!Array.isArray(value?.lines) || !value.lines.length || value.lines.length > maxCartLines) return null;
  const merged = new Map();
  for (const line of value.lines) {
    const id = String(line?.id ?? '');
    const quantity = Number(line?.quantity);
    if (!/^\d+$/.test(id) || !shopifyVariants[id] || !Number.isInteger(quantity) || quantity < 1) return null;
    merged.set(id, Math.min(maxLineQuantity, (merged.get(id) || 0) + quantity));
  }
  return [...merged].map(([id, quantity]) => ({id, quantity}));
}

// A Shopify cart permalink opens Shopify checkout with the bag's items (backup
// for the Storefront API). With toCartPage it opens the ruchs.in cart page
// instead, where the store's Shiprocket (Fastrr) BUY NOW checkout runs.
function cartPermalink(lines, toCartPage = false) {
  const items = lines.map(line => `${line.id}:${line.quantity}`).join(',');
  return `https://${shopifyStorefrontDomain}/cart/${items}?${toCartPage ? 'storefront=true&' : ''}ref=myruchs`;
}

// Shiprocket (Fastrr) checkout on myruchs.com itself: with the store's
// Shiprocket Checkout API key and secret, the Worker signs the cart and the
// browser opens the same checkout popup as ruchs.in (HeadlessCheckout.addToCart).
// Without the keys, shoppers reach it through the ruchs.in cart page.
const shiprocketCheckoutApi = 'https://checkout-api.shiprocket.com/api/v1/access-token/checkout';

async function hmacBase64(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function shiprocketCheckout(lines, origin, env) {
  const fallbackUrl = cartPermalink(lines, true);
  if (!env.SHIPROCKET_CHECKOUT_API_KEY || !env.SHIPROCKET_CHECKOUT_SECRET) return json({url: fallbackUrl, mode: 'shiprocket-cart'});
  try {
    const body = JSON.stringify({
      cart_data: {items: lines.map(line => ({variant_id: line.id, quantity: line.quantity}))},
      redirect_url: `${origin}/?checkout=complete`,
      timestamp: new Date().toISOString(),
    });
    const response = await timedFetch(shiprocketCheckoutApi, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Api-Key': env.SHIPROCKET_CHECKOUT_API_KEY,
        'X-Api-HMAC-SHA256': await hmacBase64(env.SHIPROCKET_CHECKOUT_SECRET, body),
      },
      body,
    }, 15000);
    if (!response.ok) throw new Error(`shiprocket-status-${response.status}`);
    const data = await response.json();
    const token = data?.result?.token ?? data?.token;
    if (typeof token !== 'string' || !token) throw new Error('shiprocket-missing-token');
    return json({token, fallbackUrl, mode: 'shiprocket'});
  } catch (error) {
    console.error('Shiprocket checkout token unavailable', error?.message || 'unknown');
    return json({url: fallbackUrl, mode: 'shiprocket-cart'});
  }
}

async function storefrontQuery(request, env, query, variables) {
  const version = env.SHOPIFY_API_VERSION || shopifyDefaultApiVersion;
  const headers = {
    'content-type': 'application/json',
    'Shopify-Storefront-Private-Token': env.SHOPIFY_STOREFRONT_TOKEN,
  };
  const buyerIp = request.headers.get('cf-connecting-ip');
  if (buyerIp) headers['Shopify-Storefront-Buyer-IP'] = buyerIp;
  const response = await timedFetch(`https://${shopifyStoreDomain}/api/${version}/graphql.json`, {
    method: 'POST', headers, body: JSON.stringify({query, variables}),
  }, 15000);
  if (!response.ok) throw new Error(`storefront-status-${response.status}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error('storefront-graphql-error');
  return body.data;
}

const cartCreateMutation = `mutation CartCreate($lines: [CartLineInput!]!) {
  cartCreate(input: {lines: $lines, attributes: [{key: "source", value: "myruchs.com"}]}) {
    cart { checkoutUrl }
    userErrors { field message }
  }
}`;

async function checkout(request, env) {
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin) return json({error: 'This request must come from the storefront.'}, 403);
  let fields;
  try { fields = await request.json(); }
  catch { return json({error: 'Your bag could not be read.'}, 400); }
  const lines = cartLines(fields);
  if (!lines) return json({error: 'Your bag has an item that is no longer available. Please remove it and try again.'}, 400);
  if (fields.provider === 'shiprocket') return shiprocketCheckout(lines, origin, env);

  if (env.SHOPIFY_STOREFRONT_TOKEN) {
    try {
      const data = await storefrontQuery(request, env, cartCreateMutation, {
        lines: lines.map(line => ({merchandiseId: `gid://shopify/ProductVariant/${line.id}`, quantity: line.quantity})),
      });
      const result = data?.cartCreate;
      if (result?.userErrors?.length) {
        return json({error: result.userErrors[0].message || 'Some items in your bag are unavailable.'}, 409);
      }
      const url = result?.cart?.checkoutUrl;
      if (typeof url === 'string' && url.startsWith('https://')) return json({url, mode: 'storefront'});
      throw new Error('missing-checkout-url');
    } catch (error) {
      console.error('Shopify cart unavailable, using permalink', error?.message || 'unknown');
    }
  }
  return json({url: cartPermalink(lines), mode: 'permalink'});
}

const inventoryQuery = `query Inventory($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { handle variants(first: 100) { nodes { id availableForSale price { amount } compareAtPrice { amount } } } }
  }
}`;

async function inventory(request, env, context) {
  if (!env.SHOPIFY_STOREFRONT_TOKEN) return json({live: false, variants: {}});
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(new URL('/api/inventory', request.url).href);
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;
  try {
    const variants = {};
    let cursor = null;
    for (let page = 0; page < 5; page++) {
      const data = await storefrontQuery(request, env, inventoryQuery, {cursor});
      for (const product of data.products.nodes) {
        for (const variant of product.variants.nodes) {
          const id = variant.id.split('/').pop();
          if (!shopifyVariants[id]) continue;
          variants[id] = {
            available: !!variant.availableForSale,
            price: variant.price.amount,
            compareAtPrice: variant.compareAtPrice?.amount ?? null,
          };
        }
      }
      if (!data.products.pageInfo.hasNextPage) break;
      cursor = data.products.pageInfo.endCursor;
    }
    const response = new Response(JSON.stringify({live: true, variants}), {
      headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${inventoryCacheSeconds}`},
    });
    if (cache) {
      const write = cache.put(cacheKey, response.clone());
      if (context?.waitUntil) context.waitUntil(write); else await write;
    }
    return response;
  } catch (error) {
    console.error('Shopify inventory unavailable', error?.message || 'unknown');
    return json({live: false, variants: {}});
  }
}

export default {
  async fetch(request, env, context) {
    const path = new URL(request.url).pathname;
    if (path === '/api/checkout' && request.method === 'POST') return checkout(request, env);
    if (path === '/api/inventory' && request.method === 'GET') return inventory(request, env, context);
    if (path === '/api/live/status' && request.method === 'GET') return liveStatus(request, env);
    if (path === '/api/live/garment' && request.method === 'GET') return liveGarment(request);
    if (path === '/api/live/token' && request.method === 'POST') return createLiveToken(request, env);
    if (path === '/api/try-on/status' && request.method === 'GET') {
      if (!env.GENLOOK_API_KEY || !env.DB) return json({available: false, reason: 'Try-on is unavailable right now.'});
      try {
        const day = new Date().toISOString().slice(0, 10);
        if (await providerPaused(env.DB, day)) return json({available: false, reason: providerUnavailableMessage});
        const row = await env.DB.prepare('SELECT count FROM tryon_quota WHERE day = ? AND scope = ? AND subject = ?').bind(day, 'global', 'all').first();
        const available = Number(row?.count || 0) < dailyLimit;
        return json({available, reason: available ? null : 'Today’s try-on previews are full. Please try again tomorrow.'});
      } catch {
        return json({available: false, reason: 'Try-on is unavailable right now.'});
      }
    }
    if (path === '/api/try-on' && request.method === 'POST') return tryOn(request, env);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', {status: 405});
    if (path.startsWith('/cdn/')) {
      return Response.redirect(`https://www.ruchs.in${path}`, 302);
    }
    const key = path === '/' ? '/' : path.replace(/\/$/, '') + '/';
    const html = pages[key];
    if (html) return new Response(request.method === 'HEAD' ? null : html, {headers: {'content-type': 'text/html; charset=utf-8'}});
    const asset = siteAssets[path];
    if (asset) return new Response(request.method === 'HEAD' ? null : asset.content, {headers: {'content-type': asset.type}});
    return new Response('Not found', {status: 404});
  },
};
