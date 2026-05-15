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

function cleanPathSegment(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .split('/')
    .filter(segment => segment.length > 0 && segment !== '.' && segment !== '..')
    .join('/');
}

function normalizeNamespace(value) {
  const namespace = cleanPathSegment(value || 'default');
  return namespace.length > 0 ? namespace : 'default';
}

function normalizeDisplayPath(value, fallbackContentId) {
  const displayPath = cleanPathSegment(value || fallbackContentId);
  return displayPath.length > 0 ? displayPath : cleanPathSegment(fallbackContentId);
}

function normalizeContentKey(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '';
  }

  const text = value.trim();
  if (text.startsWith('/mcdn/')) {
    return cleanPathSegment(text.slice('/mcdn/'.length));
  }

  return cleanPathSegment(text);
}

function buildPublicPath(namespace, displayPath) {
  return `/mcdn/${normalizeNamespace(namespace)}/${normalizeDisplayPath(displayPath, 'asset')}`;
}

function legacySafeContentId(contentId) {
  return String(contentId).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function hashStoragePath(config, sha256) {
  const cleanHash = String(sha256 || '').toLowerCase().replace(/[^a-f0-9]/g, '');
  if (cleanHash.length < 4) {
    throw new Error('valid sha256 is required for hash storage');
  }
  return path.resolve(config.cacheDir, 'sha256', cleanHash.slice(0, 2), cleanHash);
}

function legacyCacheFilePath(config, contentId) {
  return path.resolve(config.cacheDir, legacySafeContentId(contentId));
}

function manifestSnapshot() {
  return {
    version: 2,
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

function normalizeManifestEntry(item) {
  const contentId = normalizeContentKey(item.contentId || item.publicPath || '');
  const namespace = normalizeNamespace(item.namespace || 'default');
  const displayPath = normalizeDisplayPath(item.displayPath || contentId, contentId);
  const publicPath = item.publicPath || buildPublicPath(namespace, displayPath);
  return {
    ...item,
    contentId,
    namespace,
    displayPath,
    publicPath,
    safeName: item.safeName || legacySafeContentId(contentId),
    filePath: item.filePath
  };
}

function findManifestEntry(contentKey) {
  const normalized = normalizeContentKey(contentKey);
  if (manifest.has(normalized)) {
    return manifest.get(normalized);
  }

  for (const entry of manifest.values()) {
    if (normalizeContentKey(entry.publicPath) === normalized) {
      return entry;
    }
  }

  return null;
}

async function loadManifest() {
  try {
    const raw = await fs.readFile(manifestFile, 'utf8');
    const data = JSON.parse(raw);
    manifest.clear();
    if (Array.isArray(data.cachedContent)) {
      for (const item of data.cachedContent) {
        const entry = normalizeManifestEntry(item);
        if (entry.contentId.length > 0) {
          manifest.set(entry.contentId, entry);
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

  for (const entry of manifest.values()) {
    try {
      await advertiseContent(config, entry.contentId);
    } catch (err) {
      console.error(`manifest advertise failed for ${entry.contentId}: ${err.message}`);
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

async function cacheLocalFile(config, requestBody) {
  if (config.microCdnEnabled !== true) {
    throw new Error('micro CDN mode is disabled');
  }

  const sourcePath = requestBody.sourcePath;
  if (!sourcePath) {
    throw new Error('sourcePath is required');
  }

  const namespace = normalizeNamespace(requestBody.namespace || 'default');
  const displayPath = normalizeDisplayPath(requestBody.displayPath || requestBody.contentId, requestBody.contentId || path.basename(sourcePath));
  const contentId = normalizeContentKey(requestBody.contentId || `${namespace}/${displayPath}`);
  const publicPath = requestBody.publicPath || buildPublicPath(namespace, displayPath);

  await fs.mkdir(config.cacheDir, { recursive: true });
  const tempDestination = legacyCacheFilePath(config, `${contentId}.tmp`);
  await fs.copyFile(sourcePath, tempDestination);

  const actualSha256 = await hashFile(tempDestination);
  if (requestBody.sha256 && actualSha256.toLowerCase() !== String(requestBody.sha256).toLowerCase()) {
    await fs.rm(tempDestination, { force: true });
    throw new Error(`hash mismatch for ${contentId}`);
  }

  const destination = hashStoragePath(config, actualSha256);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rename(tempDestination, destination);

  const stat = await fs.stat(destination);
  const entry = {
    contentId,
    namespace,
    displayPath,
    publicPath,
    safeName: legacySafeContentId(contentId),
    sha256: actualSha256,
    filePath: destination,
    localCachePath: destination,
    sizeBytes: stat.size,
    sourcePath: path.resolve(sourcePath),
    originUrl: requestBody.originUrl || requestBody.url || `local-file://${path.resolve(sourcePath)}`,
    contentType: requestBody.contentType || 'application/octet-stream',
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

async function deleteCachedFile(config, contentKey) {
  const entry = findManifestEntry(contentKey);
  const contentId = entry ? entry.contentId : normalizeContentKey(contentKey);
  const targetPath = entry ? entry.filePath : legacyCacheFilePath(config, contentId);

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
    publicPath: entry ? entry.publicPath : null,
    deletedFile: true,
    removedManifestEntry: hadManifestEntry,
    unadvertiseResult
  };
}

async function serveCachedFile(config, contentKey, res) {
  if (config.microCdnEnabled !== true) {
    sendJson(res, 403, { error: 'micro CDN mode is disabled' });
    return;
  }

  const entry = findManifestEntry(contentKey);
  if (!entry) {
    sendJson(res, 404, { error: 'cached file is not in manifest' });
    return;
  }

  try {
    const stat = await fs.stat(entry.filePath);
    if (!stat.isFile()) {
      manifest.delete(entry.contentId);
      await queueSaveManifest();
      sendJson(res, 404, { error: 'cached file not found' });
      return;
    }

    res.writeHead(200, {
      'content-type': entry.contentType || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'public, max-age=60',
      'x-after-cloudflare-content-id': entry.contentId,
      'x-after-cloudflare-public-path': entry.publicPath,
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
    manifest.delete(entry.contentId);
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
        if (!body.contentId && !body.displayPath) {
          sendJson(res, 400, { error: 'contentId or displayPath is required' });
          return;
        }
        if (!body.sourcePath) {
          sendJson(res, 400, { error: 'sourcePath is required' });
          return;
        }
        const result = await cacheLocalFile(config, body);
        sendJson(res, 200, { ok: true, result });
        return;
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/mcdn/')) {
        const result = await deleteCachedFile(config, url.pathname);
        sendJson(res, 200, { ok: true, result });
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/mcdn/')) {
        await serveCachedFile(config, url.pathname, res);
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
