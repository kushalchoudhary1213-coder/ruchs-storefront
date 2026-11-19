import http from 'node:http';
import {Readable} from 'node:stream';
import {createReadStream, statSync} from 'node:fs';
import worker from '../dist/server/index.js';
import {createLocalQuotaDb} from './local_quota.mjs';

const port = Number(process.env.PORT || 4173);
const DB = createLocalQuotaDb();
const mediaFiles = new Map([
  ['/media/ruchs-campaign.mp4', {file: new URL('../dist/static/media/ruchs-campaign.mp4', import.meta.url), type: 'video/mp4'}],
  ['/media/ruchs-campaign-poster.jpg', {file: new URL('../dist/static/media/ruchs-campaign-poster.jpg', import.meta.url), type: 'image/jpeg'}],
]);
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
