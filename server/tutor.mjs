import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tutorConfig, quotaStore, createTutorHandler } from './tutor-core.mjs';

process.umask(0o077);
const config = tutorConfig(process.env);
const db = config.db ? resolve(config.db) : ':memory:';
if (config.db) mkdirSync(dirname(db), { recursive: true });
const quota = quotaStore(db, config);
const handle = createTutorHandler({ config, quota });

function readBody(request, max) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const parts = [];
    request.on('data', (part) => {
      size += part.length;
      if (size > max) {
        reject(Object.assign(new Error('Velký požadavek'), { code: 'BODY_LIMIT' }));
        return;
      }
      parts.push(part);
    });
    request.once('end', () => resolveBody(Buffer.concat(parts).toString('utf8')));
    request.once('error', reject);
    request.once('aborted', reject);
  });
}

const server = createServer({ requestTimeout: 5000, headersTimeout: 4000, keepAliveTimeout: 4000, connectionsCheckingInterval: 1000, maxHeaderSize: 8192 }, async (request, response) => {
  if (request.url === '/healthz' && request.method === 'GET') {
    response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' }).end(JSON.stringify({ ready: true, mode: config.mode }));
    return;
  }
  if (request.url !== '/v1/tutor') { response.writeHead(404).end(); return; }
  const result = await handle({ method: request.method, headers: request.headers, readBody: (max) => readBody(request, max) });
  response.writeHead(result.status, result.headers).end(result.body ? JSON.stringify(result.body) : undefined);
});
const port = Number(process.env.TUTOR_PORT || 8787);
server.listen(port, '127.0.0.1', () => console.log(`Tutor (${config.mode}) naslouchá na portu ${port}.`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => quota.close()));
