import http from 'node:http';
import {Readable} from 'node:stream';
import {createReadStream, statSync, readdirSync} from 'node:fs';
import {extname, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../dist/server/index.js';
import {createLocalQuotaDb} from './local_quota.mjs';

const port = Number(process.env.PORT || 4173);
const DB = createLocalQuotaDb();
const assetDirectory = fileURLToPath(new URL('../dist/static/', import.meta.url));
const contentTypes = {'.mp4':'video/mp4', '.webp':'image/webp', '.jpg':'image/jpeg', '.css':'text/css', '.js':'text/javascript', '.woff2':'font/woff2', '.avif':'image/avif', '.png':'image/png'};
const mediaFiles = new Map();
for (const entry of readdirSync(assetDirectory, {recursive: true, withFileTypes: true})) {
  if (!entry.isFile()) continue;
  const file = join(entry.parentPath ?? entry.path, entry.name);
  const pathname = '/' + relative(assetDirectory, file).split(sep).map(encodeURIComponent).join('/');
  mediaFiles.set(pathname, {file, type: contentTypes[extname(file)] ?? 'application/octet-stream'});
}
http.createServer(async (incoming, outgoing) => {
  const pathname = new URL(incoming.url, `http://127.0.0.1:${port}`).pathname;
  const media = mediaFiles.get(pathname);
  if (media && (incoming.method === 'GET' || incoming.method === 'HEAD')) {
    const size = statSync(media.file).size;
    const range = /^bytes=(\d+)-(\d*)$/.exec(incoming.headers.range || '');
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || end < start) {
      outgoing.writeHead(416, {'content-range': `bytes */${size}`});
      outgoing.end();
      return;
    }
    outgoing.writeHead(range ? 206 : 200, {
      'content-type': media.type,
      'content-length': end - start + 1,
      'accept-ranges': 'bytes',
      ...(range ? {'content-range': `bytes ${start}-${end}/${size}`} : {}),
    });
    if (incoming.method === 'HEAD') outgoing.end();
    else createReadStream(media.file, {start, end}).pipe(outgoing);
    return;
  }
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  const url = `http://127.0.0.1:${port}${incoming.url}`;
  const request = new Request(url, {
    method: incoming.method,
    headers: incoming.headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
  try {
    const response = await worker.fetch(request, {
      GENLOOK_API_KEY: process.env.GENLOOK_API_KEY,
      DECART_API_KEY: process.env.DECART_API_KEY,
      DB,
    });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500);
    outgoing.end('Internal error');
  }
}).listen(port, '127.0.0.1', () => console.log(`Ruchs Worker preview: http://127.0.0.1:${port}`));
