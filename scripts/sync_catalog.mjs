// Refresh the catalog snapshot from the Ruchs Shopify store.
//
// Updates dist/products.json (products, variants, prices, descriptions,
// images), the collection membership in data/content.json, and downloads new
// product photos into dist/cdn/shop/files. Run `npm run build` afterwards, or
// `npm run sync:deploy` to sync, build and deploy in one step.
import {mkdir, readFile, writeFile, access} from 'node:fs/promises';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const store = 'https://checkout.myruchs.com';
const headers = {'user-agent': 'Mozilla/5.0 (compatible; ruchs-catalog-sync)', accept: 'application/json'};

async function getJson(url, attempt = 1) {
  const response = await fetch(url, {headers});
  if ((response.status === 429 || response.status >= 500) && attempt < 6) {
    const wait = Number(response.headers.get('retry-after')) * 1000 || attempt * 4000;
    console.log(`  ${response.status} from Shopify, retrying in ${Math.round(wait / 1000)}s`);
    await new Promise(resolve => setTimeout(resolve, wait));
    return getJson(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`${url} did not return JSON: ${text.slice(0, 80)}`); }
}

async function allProducts(path) {
  const products = [];
  for (let page = 1; page <= 20; page++) {
    const batch = (await getJson(`${store}${path}?limit=250&page=${page}`)).products;
    products.push(...batch);
    if (batch.length < 250) break;
  }
  return products;
}

const exists = path => access(path).then(() => true, () => false);

const productsPath = join(root, 'dist', 'products.json');
const contentPath = join(root, 'data', 'content.json');
const previous = JSON.parse(await readFile(productsPath, 'utf8')).products;
const content = JSON.parse(await readFile(contentPath, 'utf8'));

console.log('Fetching products from Shopify…');
const products = await allProducts('/products.json');
if (!products.length) throw new Error('Shopify returned no products; keeping the current catalog.');

const before = new Set(previous.map(product => product.handle));
const after = new Set(products.map(product => product.handle));
const added = [...after].filter(handle => !before.has(handle));
const removed = [...before].filter(handle => !after.has(handle));

console.log('Fetching collections…');
for (const handle of Object.keys(content.collections)) {
  const members = await allProducts(`/collections/${handle}/products.json`);
  content.collections[handle].products = members.map(product => product.handle).filter(member => after.has(member));
}

const files = join(root, 'dist', 'cdn', 'shop', 'files');
await mkdir(files, {recursive: true});
let downloaded = 0;
for (const image of products.flatMap(product => product.images)) {
  const name = decodeURIComponent(basename(new URL(image.src).pathname));
  const target = join(files, name);
  if (await exists(target)) continue;
  const response = await fetch(image.src);
  if (!response.ok) throw new Error(`Image ${image.src} returned ${response.status}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  downloaded++;
}

await writeFile(productsPath, JSON.stringify({products}));
await writeFile(contentPath, JSON.stringify(content, null, 2));
console.log(`Catalog synced: ${products.length} products, ${products.reduce((sum, product) => sum + product.variants.length, 0)} variants, ${downloaded} new photos.`);
if (added.length) console.log(`Added: ${added.join(', ')}`);
if (removed.length) console.log(`Removed: ${removed.join(', ')}`);
