import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';

const configPath = process.env.CONFIG || './config.example.json';
const startedAtMs = Date.now();
const metrics = {
  cacheHits: 0,
  bytesServed: 0
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, statusCode, body) {
  res.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw.length === 0 ? {} : JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let body = {};
  if (text.length > 0) {
    body = JSON.parse(text);
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return body;
}

async function loadConfig() {
  const raw = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(raw);
  config.port = Number.parseInt(String(config.port || 8081), 10);
  config.heartbeatSeconds = Number.parseInt(String(config.heartbeatSeconds || 10), 10);
  config.cacheDir = config.cacheDir || './cache';
  config.publicAddress = String(config.publicAddress || `http://127.0.0.1:${config.port}`).replace(/\/$/, '');
  return config;
}

function safeContentId(contentId) {
  return String(contentId).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function cacheFilePath(config, contentId) {
  return path.resolve(config.cacheDir, safeContentId(contentId));
}

async function countCachedFiles(config) {
  try {
    const entries = await fs.readdir(config.cacheDir, { withFileTypes: true });
    return entries.filter(entry => entry.isFile()).length;
  } catch {
    return 0;
  }
}

async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fsSync.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return hash.digest('hex');
}

async function registerNode(config) {
  return postJson(`${config.coordinatorUrl}/nodes/register`, {
    nodeId: config.nodeId,
    region: config.region || 'unknown',
    maxDiskMb: config.maxDiskMb || 0,
    maxBandwidthMbps: config.maxBandwidthMbps || 0,
    microCdnEnabled: config.microCdnEnabled === true,
    publicAddress: config.publicAddress
  });
}

async function reportHealth(config) {
  return postJson(`${config.coordinatorUrl}/nodes/health`, {
    nodeId: config.nodeId,
    online: true,
    cacheHits: metrics.cacheHits,
    bytesServed: metrics.bytesServed,
    cachedFiles: await countCachedFiles(config),
    uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000)
  });
}

async function advertiseContent(config, contentId) {
  return postJson(`${config.coordinatorUrl}/content/advertise`, {
    nodeId: config.nodeId,
    contentId
  });
}

async function cacheLocalFile(config, contentId, sourcePath, expectedSha256) {
  if (config.microCdnEnabled !== true) {
    throw new Error('micro CDN mode is disabled');
  }

  await fs.mkdir(config.cacheDir, { recursive: true });
  const destination = cacheFilePath(config, contentId);
  await fs.copyFile(sourcePath, destination);

  const actualSha256 = await hashFile(destination);
  if (expectedSha256 && actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    await fs.rm(destination, { force: true });
    throw new Error(`hash mismatch for ${contentId}`);
  }

  await advertiseContent(config, contentId);
  return {
    contentId,
    sha256: actualSha256,
    filePath: destination
  };
}

async function serveCachedFile(config, contentId, res) {
  if (config.microCdnEnabled !== true) {
    sendJson(res, 403, { error: 'micro CDN mode is disabled' });
    return;
  }

  const filePath = cacheFilePath(config, contentId);
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      sendJson(res, 404, { error: 'cached file not found' });
      return;
    }

    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'public, max-age=60'
    });

    const stream = fsSync.createReadStream(filePath);
    stream.on('data', chunk => {
      metrics.bytesServed += chunk.length;
    });
    stream.on('end', () => {
      metrics.cacheHits += 1;
    });
    stream.on('error', () => {
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'failed to read cached file' });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  } catch {
    sendJson(res, 404, { error: 'cached file not found' });
  }
}

async function main() {
  const config = await loadConfig();
  await fs.mkdir(config.cacheDir, { recursive: true });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

      if (req.method === 'GET' && url.pathname === '/') {
        sendText(res, 200, 'after-cloudflare micro cdn node agent prototype\n');
        return;
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, {
          nodeId: config.nodeId,
          microCdnEnabled: config.microCdnEnabled === true,
          cacheHits: metrics.cacheHits,
          bytesServed: metrics.bytesServed,
          cachedFiles: await countCachedFiles(config),
          uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000)
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/cache/local-file') {
        const body = await readJson(req);
        if (!body.contentId || !body.sourcePath) {
          sendJson(res, 400, { error: 'contentId and sourcePath are required' });
          return;
        }
        const result = await cacheLocalFile(config, body.contentId, body.sourcePath, body.sha256);
        sendJson(res, 200, { ok: true, result });
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/cache/')) {
        const contentId = decodeURIComponent(url.pathname.slice('/cache/'.length));
        await serveCachedFile(config, contentId, res);
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : 'unknown error' });
    }
  });

  server.listen(config.port, async () => {
    console.log(`micro cdn node agent listening on ${config.publicAddress}`);
    try {
      await registerNode(config);
      await reportHealth(config);
      setInterval(() => {
        reportHealth(config).catch(err => {
          console.error(`health report failed: ${err.message}`);
        });
      }, config.heartbeatSeconds * 1000);
    } catch (err) {
      console.error(`startup registration failed: ${err.message}`);
    }
  });
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
