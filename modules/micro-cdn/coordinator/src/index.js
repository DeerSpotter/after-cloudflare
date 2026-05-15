import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';

const port = Number.parseInt(process.env.PORT || '8080', 10);
const nodeTtlMs = Number.parseInt(process.env.NODE_TTL_MS || '30000', 10);
const dataDir = process.env.DATA_DIR || './data';
const stateFile = process.env.STATE_FILE || path.join(dataDir, 'coordinator-state.json');

const nodes = new Map();
const approvedContent = new Map();
const contentNodes = new Map();
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

function requiredString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function snapshotState() {
  return {
    version: 1,
    savedAt: nowIso(),
    nodes: [...nodes.values()],
    approvedContent: [...approvedContent.values()],
    contentNodes: [...contentNodes.entries()].map(([contentId, nodeSet]) => ({
      contentId,
      nodeIds: [...nodeSet]
    }))
  };
}

async function saveStateNow() {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  const tempFile = `${stateFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(snapshotState(), null, 2), 'utf8');
  await fs.rename(tempFile, stateFile);
}

function queueSaveState() {
  saveChain = saveChain
    .then(() => saveStateNow())
    .catch(err => {
      console.error(`state save failed: ${err.message}`);
    });
  return saveChain;
}

async function loadState() {
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    const state = JSON.parse(raw);

    nodes.clear();
    approvedContent.clear();
    contentNodes.clear();

    if (Array.isArray(state.nodes)) {
      for (const node of state.nodes) {
        if (requiredString(node.nodeId)) {
          nodes.set(node.nodeId, {
            ...node,
            lastSeenMs: Number.isFinite(node.lastSeenMs) ? node.lastSeenMs : 0
          });
        }
      }
    }

    if (Array.isArray(state.approvedContent)) {
      for (const content of state.approvedContent) {
        if (requiredString(content.contentId)) {
          approvedContent.set(content.contentId, content);
        }
      }
    }

    if (Array.isArray(state.contentNodes)) {
      for (const mapping of state.contentNodes) {
        if (requiredString(mapping.contentId) && Array.isArray(mapping.nodeIds)) {
          contentNodes.set(mapping.contentId, new Set(mapping.nodeIds.filter(requiredString)));
        }
      }
    }

    console.log(`loaded coordinator state from ${stateFile}`);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.log(`no coordinator state found at ${stateFile}; starting empty`);
      return;
    }
    throw err;
  }
}

function cleanupStaleNodes() {
  const cutoff = Date.now() - nodeTtlMs;
  let changed = false;
  for (const [nodeId, node] of nodes.entries()) {
    if (node.lastSeenMs < cutoff) {
      nodes.delete(nodeId);
      changed = true;
      for (const nodeSet of contentNodes.values()) {
        if (nodeSet.delete(nodeId)) {
          changed = true;
        }
      }
    }
  }
  if (changed) {
    queueSaveState();
  }
}

function pickNodeForContent(contentId) {
  cleanupStaleNodes();
  const nodeSet = contentNodes.get(contentId);
  if (!nodeSet || nodeSet.size === 0) {
    return null;
  }

  let bestNode = null;
  for (const nodeId of nodeSet) {
    const node = nodes.get(nodeId);
    if (!node || !node.microCdnEnabled) {
      continue;
    }
    if (!bestNode || node.cacheHits < bestNode.cacheHits) {
      bestNode = node;
    }
  }
  return bestNode;
}

async function handleRegisterNode(req, res) {
  const body = await readJson(req);
  if (!requiredString(body.nodeId) || !requiredString(body.publicAddress)) {
    sendJson(res, 400, { error: 'nodeId and publicAddress are required' });
    return;
  }

  const existing = nodes.get(body.nodeId);
  const node = {
    nodeId: body.nodeId,
    region: requiredString(body.region) ? body.region : 'unknown',
    maxDiskMb: Number.isFinite(body.maxDiskMb) ? body.maxDiskMb : 0,
    maxBandwidthMbps: Number.isFinite(body.maxBandwidthMbps) ? body.maxBandwidthMbps : 0,
    microCdnEnabled: body.microCdnEnabled === true,
    publicAddress: body.publicAddress.replace(/\/$/, ''),
    cacheHits: existing ? existing.cacheHits : 0,
    bytesServed: existing ? existing.bytesServed : 0,
    cachedFiles: existing ? existing.cachedFiles : 0,
    lastSeenMs: Date.now(),
    lastSeen: nowIso()
  };

  nodes.set(node.nodeId, node);
  await queueSaveState();
  sendJson(res, 200, { ok: true, node });
}

async function handleHealth(req, res) {
  const body = await readJson(req);
  if (!requiredString(body.nodeId)) {
    sendJson(res, 400, { error: 'nodeId is required' });
    return;
  }

  const existing = nodes.get(body.nodeId);
  if (!existing) {
    sendJson(res, 404, { error: 'node is not registered' });
    return;
  }

  existing.online = body.online !== false;
  existing.cacheHits = Number.isFinite(body.cacheHits) ? body.cacheHits : existing.cacheHits;
  existing.bytesServed = Number.isFinite(body.bytesServed) ? body.bytesServed : existing.bytesServed;
  existing.cachedFiles = Number.isFinite(body.cachedFiles) ? body.cachedFiles : existing.cachedFiles;
  existing.uptimeSeconds = Number.isFinite(body.uptimeSeconds) ? body.uptimeSeconds : 0;
  existing.lastSeenMs = Date.now();
  existing.lastSeen = nowIso();

  await queueSaveState();
  sendJson(res, 200, { ok: true, node: existing });
}

async function handleApproveContent(req, res) {
  const body = await readJson(req);
  if (!requiredString(body.contentId) || !requiredString(body.sha256) || !requiredString(body.url)) {
    sendJson(res, 400, { error: 'contentId, sha256, and url are required' });
    return;
  }

  const existing = approvedContent.get(body.contentId);
  const content = {
    contentId: body.contentId,
    sha256: body.sha256.toLowerCase(),
    url: body.url,
    maxAgeSeconds: Number.isFinite(body.maxAgeSeconds) ? body.maxAgeSeconds : 86400,
    createdAt: existing ? existing.createdAt : nowIso(),
    updatedAt: nowIso()
  };

  approvedContent.set(content.contentId, content);
  await queueSaveState();
  sendJson(res, 200, { ok: true, content });
}

async function handleAdvertiseContent(req, res) {
  const body = await readJson(req);
  if (!requiredString(body.nodeId) || !requiredString(body.contentId)) {
    sendJson(res, 400, { error: 'nodeId and contentId are required' });
    return;
  }

  if (!nodes.has(body.nodeId)) {
    sendJson(res, 404, { error: 'node is not registered' });
    return;
  }

  if (!approvedContent.has(body.contentId)) {
    sendJson(res, 403, { error: 'content is not approved' });
    return;
  }

  let nodeSet = contentNodes.get(body.contentId);
  if (!nodeSet) {
    nodeSet = new Set();
    contentNodes.set(body.contentId, nodeSet);
  }
  nodeSet.add(body.nodeId);

  const node = nodes.get(body.nodeId);
  node.cachedFiles = Math.max(node.cachedFiles, nodeSet.size);
  node.lastSeenMs = Date.now();
  node.lastSeen = nowIso();

  await queueSaveState();
  sendJson(res, 200, { ok: true, contentId: body.contentId, nodeId: body.nodeId });
}

function handleRoute(url, res) {
  const contentId = url.searchParams.get('contentId');
  if (!requiredString(contentId)) {
    sendJson(res, 400, { error: 'contentId query parameter is required' });
    return;
  }

  const content = approvedContent.get(contentId);
  if (!content) {
    sendJson(res, 404, { error: 'content is not approved' });
    return;
  }

  const node = pickNodeForContent(contentId);
  if (!node) {
    sendJson(res, 404, { error: 'no healthy node currently serves this content' });
    return;
  }

  sendJson(res, 200, {
    contentId,
    sha256: content.sha256,
    selectedNode: {
      nodeId: node.nodeId,
      region: node.region,
      downloadUrl: `${node.publicAddress}/cache/${encodeURIComponent(contentId)}`
    }
  });
}

function handleStatus(res) {
  cleanupStaleNodes();
  sendJson(res, 200, {
    ok: true,
    persistent: true,
    stateFile,
    nodes: [...nodes.values()].map(node => ({
      nodeId: node.nodeId,
      region: node.region,
      publicAddress: node.publicAddress,
      microCdnEnabled: node.microCdnEnabled,
      cacheHits: node.cacheHits,
      bytesServed: node.bytesServed,
      cachedFiles: node.cachedFiles,
      lastSeen: node.lastSeen
    })),
    approvedContent: [...approvedContent.values()],
    contentNodes: [...contentNodes.entries()].map(([contentId, nodeSet]) => ({
      contentId,
      nodes: [...nodeSet]
    }))
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

    if (req.method === 'GET' && url.pathname === '/') {
      sendText(res, 200, 'after-cloudflare micro cdn coordinator prototype\n');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      handleStatus(res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/route') {
      handleRoute(url, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/nodes/register') {
      await handleRegisterNode(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/nodes/health') {
      await handleHealth(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/content/approve') {
      await handleApproveContent(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/content/advertise') {
      await handleAdvertiseContent(req, res);
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'unknown error' });
  }
});

await loadState();

server.listen(port, () => {
  console.log(`micro cdn coordinator listening on http://127.0.0.1:${port}`);
  console.log(`coordinator state file: ${stateFile}`);
});
