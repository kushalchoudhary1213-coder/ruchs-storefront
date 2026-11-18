const providerBase = 'https://api.genlook.app/tryon/v1';
const noStore = {'cache-control': 'no-store'};

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

async function tryOn(request, env) {
  if (!env.GENLOOK_API_KEY) return json({error: 'Try-on is unavailable right now.'}, 503);
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

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/try-on/status' && request.method === 'GET') {
      return json({available: !!env.GENLOOK_API_KEY});
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
