import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';

const port = Number.parseInt(process.env.PORT || '18082', 10);
const delayMs = Number.parseInt(process.env.RESPONSE_DELAY_MS || '500', 10);
const contentPath = process.env.CONTENT_PATH || '/mcdn/demo/hello.txt';
const filePath = process.env.FILE_PATH || path.resolve('../demo-assets/hello.txt');
const contentType = process.env.CONTENT_TYPE || 'text/plain; charset=utf-8';

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        fixture: 'slow-node',
        delayMs,
        contentPath
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === contentPath) {
      await sleep(delayMs);
      const body = await fs.readFile(filePath);
      res.writeHead(200, {
        'content-type': contentType,
        'content-length': body.length,
        'x-after-cloudflare-fixture': 'slow-node',
        'x-after-cloudflare-delay-ms': String(delayMs)
      });
      res.end(body);
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'unknown error'
    });
  }
});

server.listen(port, () => {
  console.log(`slow node fixture listening on http://127.0.0.1:${port}`);
  console.log(`content path: ${contentPath}`);
  console.log(`response delay ms: ${delayMs}`);
});
