import http from 'node:http';
import {Readable} from 'node:stream';
import worker from '../dist/server/index.js';

const port = Number(process.env.PORT || 4173);
http.createServer(async (incoming, outgoing) => {
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  const url = `http://127.0.0.1:${port}${incoming.url}`;
  const request = new Request(url, {
    method: incoming.method,
    headers: incoming.headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
  try {
    const response = await worker.fetch(request, {GENLOOK_API_KEY: process.env.GENLOOK_API_KEY});
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500);
    outgoing.end('Internal error');
  }
}).listen(port, '127.0.0.1', () => console.log(`Ruchs Worker preview: http://127.0.0.1:${port}`));
