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
const manifest = new Map();
let manifestFile = '';
let saveChain = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

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
  config.manifestFile = config.manifestFile || path.join(config.cacheDir, 'manifest.json');
  config.publicAddress = String(config.publicAddress || `http://127.0.0.1:${config.port}`).replace(/\/$/, '');
  manifestFile = path.resolve(config.manifestFile);
  return config;
}

function safeContentId(contentId) {
  return String(contentId).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function cacheFilePath(config, contentId) {
  return path.resolve(config.cacheDir, safeContentId(contentId));
}

function manifestSnapshot() {
  return {
    version: 1,
    savedAt: nowIso(),
    cachedContent: [...manifest.values()]
  };
}

async function saveManifestNow() {
  await fs.mkdir(path.dirname(manifestFile), { recursive: true });
  const tempFile = `${manifestFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(manifestSnapshot(), null, 2), 'utf8');
  await fs.rename(tempFile, manifestFile);
}

function queueSaveManifest() {
  saveChain = saveChain
    .then(() => saveManifestNow())
    .catch(err => {
      console.error(`manifest save failed: ${err.message}`);
    });
  return saveChain;
}

async function loadManifest() {
  try {
    const raw = await fs.readFile(manifestFile, 'utf8');
    const data = JSON.parse(raw);
    manifest.clear();
    if (Array.isArray(data.cachedContent)) {
      for (const item of data.cachedContent) {
        if (typeof item.contentId === 'string' && item.contentId.length > 0) {
          manifest.set(item.contentId, item);
        }
      }
    }
    console.log(`loaded node cache manifest from ${manifestFile}`);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.log(`no node cache manifest found at ${manifestFile}; starting empty`);
      return;
    }
    throw err;
  }
}

async function reconcileManifest(config) {
  let changed = false;
  for (const [contentId, item] of manifest.entries()) {
    try {
      const stat = await fs.stat(item.filePath);
      if (!stat.isFile()) {
        manifest.delete(contentId);
        changed = true;
        continue;
      }
      item.sizeBytes = stat.size;
      item.lastVerifiedAt = nowIso();
    } catch {
      manifest.delete(contentId);
      changed = true;
    }
  }

  if (changed) {
    await queueSaveManifest();
  }
}

async function advertiseManifest(config) {
  if (config.microCdnEnabled !== true) {
    return;
  }

  for (const contentId of manifest.keys()) {
    try {
      await advertiseContent(config, contentId);
    } catch (err) {
      console.error(`manifest advertise failed for ${contentId}: ${err.message}`);
    }
  }
}

async function countCachedFiles() {
  return manifest.size;
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
    cachedFiles: await countCachedFiles(),
    uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000)
  });
}

async function advertiseContent(config, contentId) {
  return postJson(`${config.coordinatorUrl}/content/advertise`, {
    nodeId: config.nodeId,
    contentId
  });
}

async function unadvertiseContent(config, contentId) {
  return postJson(`${config.coordinatorUrl}/content/unadvertise`, {
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

  const stat = await fs.stat(destination);
  const entry = {
    contentId,
    safeName: safeContentId(contentId),
    sha256: actualSha256,
    filePath: destination,
    sizeBytes: stat.size,
    sourcePath: path.resolve(sourcePath),
    cachedAt: nowIso(),
    lastVerifiedAt: nowIso(),
    hits: 0,
    bytesServed: 0
  };

  manifest.set(contentId, entry);
  await queueSaveManifest();
  await advertiseContent(config, contentId);
  return entry;
}

async function deleteCachedFile(config, contentId) {
  const entry = manifest.get(contentId);
  const targetPath = entry ? entry.filePath : cacheFilePath(config, contentId);

  await fs.rm(targetPath, { force: true });
  const hadManifestEntry = manifest.delete(contentId);
  await queueSaveManifest();

  let unadvertiseResult = null;
  try {
    unadvertiseResult = await unadvertiseContent(config, contentId);
  } catch (err) {
    unadvertiseResult = {
      ok: false,
      error: err instanceof Error ? err.message : 'unknown error'
    };
  }

  return {
    contentId,
    deletedFile: true,
    removedManifestEntry: hadManifestEntry,
    unadvertiseResult
  };
}

async function serveCachedFile(config, contentId, res) {
  if (config.microCdnEnabled !== true) {
    sendJson(res, 403, { error: 'micro CDN mode is disabled' });
    return;
  }

  const entry = manifest.get(contentId);
  if (!entry) {
    sendJson(res, 404, { error: 'cached file is not in manifest' });
    return;
  }

  try {
    const stat = await fs.stat(entry.filePath);
    if (!stat.isFile()) {
      manifest.delete(contentId);
      await queueSaveManifest();
      sendJson(res, 404, { error: 'cached file not found' });
      return;
    }

    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'public, max-age=60',
      'x-after-cloudflare-content-id': contentId,
      'x-after-cloudflare-sha256': entry.sha256
    });

    const stream = fsSync.createReadStream(entry.filePath);
    stream.on('data', chunk => {
      metrics.bytesServed += chunk.length;
      entry.bytesServed += chunk.length;
    });
    stream.on('end', () => {
      metrics.cacheHits += 1;
      entry.hits += 1;
      entry.lastServedAt = nowIso();
      queueSaveManifest();
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
    manifest.delete(contentId);
    await queueSaveManifest();
    sendJson(res, 404, { error: 'cached file not found' });
  }
}

async function main() {
  const config = await loadConfig();
  await fs.mkdir(config.cacheDir, { recursive: true });
  await loadManifest();
  await reconcileManifest(config);

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
          cachedFiles: await countCachedFiles(),
          uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000)
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/manifest') {
        sendJson(res, 200, manifestSnapshot());
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

      if (req.method === 'DELETE' && url.pathname.startsWith('/cache/')) {
        const contentId = decodeURIComponent(url.pathname.slice('/cache/'.length));
        const result = await deleteCachedFile(config, contentId);
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
    console.log(`node cache manifest: ${manifestFile}`);
    try {
      await registerNode(config);
      await advertiseManifest(config);
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
