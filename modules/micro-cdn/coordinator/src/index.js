import http from 'node:http';
import { URL } from 'node:url';

const port = Number.parseInt(process.env.PORT || '8080', 10);
const nodeTtlMs = Number.parseInt(process.env.NODE_TTL_MS || '30000', 10);

const nodes = new Map();
const approvedContent = new Map();
const contentNodes = new Map();

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

function cleanupStaleNodes() {
  const cutoff = Date.now() - nodeTtlMs;
  for (const [nodeId, node] of nodes.entries()) {
    if (node.lastSeenMs < cutoff) {
      nodes.delete(nodeId);
      for (const nodeSet of contentNodes.values()) {
        nodeSet.delete(nodeId);
      }
    }
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

  const node = {
    nodeId: body.nodeId,
    region: requiredString(body.region) ? body.region : 'unknown',
    maxDiskMb: Number.isFinite(body.maxDiskMb) ? body.maxDiskMb : 0,
    maxBandwidthMbps: Number.isFinite(body.maxBandwidthMbps) ? body.maxBandwidthMbps : 0,
    microCdnEnabled: body.microCdnEnabled === true,
    publicAddress: body.publicAddress.replace(/\/$/, ''),
    cacheHits: 0,
    bytesServed: 0,
    cachedFiles: 0,
    lastSeenMs: Date.now(),
    lastSeen: nowIso()
  };

  nodes.set(node.nodeId, node);
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

  sendJson(res, 200, { ok: true, node: existing });
}

async function handleApproveContent(req, res) {
  const body = await readJson(req);
  if (!requiredString(body.contentId) || !requiredString(body.sha256) || !requiredString(body.url)) {
    sendJson(res, 400, { error: 'contentId, sha256, and url are required' });
    return;
  }

  const content = {
    contentId: body.contentId,
    sha256: body.sha256.toLowerCase(),
    url: body.url,
    maxAgeSeconds: Number.isFinite(body.maxAgeSeconds) ? body.maxAgeSeconds : 86400,
    createdAt: nowIso()
  };

  approvedContent.set(content.contentId, content);
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

server.listen(port, () => {
  console.log(`micro cdn coordinator listening on http://127.0.0.1:${port}`);
});
