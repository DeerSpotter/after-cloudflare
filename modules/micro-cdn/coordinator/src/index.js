import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';

const port = Number.parseInt(process.env.PORT || '8080', 10);
const nodeTtlMs = Number.parseInt(process.env.NODE_TTL_MS || '30000', 10);
const dataDir = process.env.DATA_DIR || './data';
const stateFile = process.env.STATE_FILE || path.join(dataDir, 'coordinator-state.json');
const defaultDeadlineMs = Number.parseInt(process.env.ROUTE_DEADLINE_MS || '1200', 10);
const defaultCoordinatorBudgetMs = Number.parseInt(process.env.COORDINATOR_BUDGET_MS || '50', 10);
const defaultFirstByteTimeoutMs = Number.parseInt(process.env.FIRST_BYTE_TIMEOUT_MS || '250', 10);
const defaultBackupRaceAfterMs = Number.parseInt(process.env.BACKUP_RACE_AFTER_MS || '75', 10);
const defaultOriginRaceAfterMs = Number.parseInt(process.env.ORIGIN_RACE_AFTER_MS || '300', 10);
const defaultCandidateLimit = Number.parseInt(process.env.ROUTE_CANDIDATE_LIMIT || '3', 10);

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

function numberOrDefault(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, parsed));
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

function buildPublicPath(namespace, displayPath) {
  return `/mcdn/${normalizeNamespace(namespace)}/${normalizeDisplayPath(displayPath, 'asset')}`;
}

function normalizeContentKey(value) {
  if (!requiredString(value)) {
    return '';
  }

  const text = String(value).trim();
  if (text.startsWith('/mcdn/')) {
    return cleanPathSegment(text.slice('/mcdn/'.length));
  }

  return cleanPathSegment(text);
}

function findContent(contentKey) {
  const normalized = normalizeContentKey(contentKey);
  if (!requiredString(normalized)) {
    return null;
  }

  if (approvedContent.has(normalized)) {
    return approvedContent.get(normalized);
  }

  for (const content of approvedContent.values()) {
    if (normalizeContentKey(content.publicPath) === normalized) {
      return content;
    }
  }

  return null;
}

function snapshotState() {
  return {
    version: 3,
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

function normalizeLoadedNode(node) {
  return {
    ...node,
    cacheHits: numberOrDefault(node.cacheHits, 0),
    bytesServed: numberOrDefault(node.bytesServed, 0),
    cachedFiles: numberOrDefault(node.cachedFiles, 0),
    requestCount: numberOrDefault(node.requestCount, 0),
    successCount: numberOrDefault(node.successCount, 0),
    timeoutCount: numberOrDefault(node.timeoutCount, 0),
    errorCount: numberOrDefault(node.errorCount, 0),
    firstByteAvgMs: numberOrDefault(node.firstByteAvgMs, null),
    firstByteP95Ms: numberOrDefault(node.firstByteP95Ms, null),
    lastSeenMs: Number.isFinite(node.lastSeenMs) ? node.lastSeenMs : 0
  };
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
          nodes.set(node.nodeId, normalizeLoadedNode(node));
        }
      }
    }

    if (Array.isArray(state.approvedContent)) {
      for (const content of state.approvedContent) {
        if (requiredString(content.contentId)) {
          const namespace = normalizeNamespace(content.namespace || 'default');
          const displayPath = normalizeDisplayPath(content.displayPath || content.contentId, content.contentId);
          const contentId = normalizeContentKey(content.contentId);
          approvedContent.set(contentId, {
            ...content,
            contentId,
            namespace,
            displayPath,
            publicPath: content.publicPath || buildPublicPath(namespace, displayPath)
          });
        }
      }
    }

    if (Array.isArray(state.contentNodes)) {
      for (const mapping of state.contentNodes) {
        if (requiredString(mapping.contentId) && Array.isArray(mapping.nodeIds)) {
          contentNodes.set(normalizeContentKey(mapping.contentId), new Set(mapping.nodeIds.filter(requiredString)));
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

function nodeSuccessRate(node) {
  const requests = numberOrDefault(node.requestCount, 0);
  if (requests <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, numberOrDefault(node.successCount, 0) / requests));
}

function nodeTimeoutRate(node) {
  const requests = numberOrDefault(node.requestCount, 0);
  if (requests <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, numberOrDefault(node.timeoutCount, 0) / requests));
}

function nodeErrorRate(node) {
  const requests = numberOrDefault(node.requestCount, 0);
  if (requests <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, numberOrDefault(node.errorCount, 0) / requests));
}

function nodeQualityScore(node) {
  const firstByteP95Ms = numberOrDefault(node.firstByteP95Ms, numberOrDefault(node.firstByteAvgMs, defaultFirstByteTimeoutMs));
  const latencyPenalty = Math.min(600, Math.max(0, firstByteP95Ms));
  const timeoutPenalty = nodeTimeoutRate(node) * 500;
  const errorPenalty = nodeErrorRate(node) * 300;
  const successBonus = nodeSuccessRate(node) * 100;
  const hitPenalty = Math.min(100, numberOrDefault(node.cacheHits, 0) * 0.01);
  return latencyPenalty + timeoutPenalty + errorPenalty - successBonus + hitPenalty;
}

function routeRole(index) {
  if (index === 0) {
    return 'primary';
  }
  if (index === 1) {
    return 'backup';
  }
  return 'alternate';
}

function buildNodeCandidate(node, content, index, options) {
  const firstByteP95Ms = numberOrDefault(node.firstByteP95Ms, numberOrDefault(node.firstByteAvgMs, options.firstByteTimeoutMs));
  const firstByteTimeoutMs = Math.max(100, Math.min(options.firstByteTimeoutMs, Math.ceil(firstByteP95Ms * 2)));
  return {
    role: routeRole(index),
    nodeId: node.nodeId,
    region: node.region,
    downloadUrl: `${node.publicAddress}${content.publicPath}`,
    firstByteTimeoutMs,
    raceAfterMs: index === 0 ? 0 : options.backupRaceAfterMs * index,
    score: Number(nodeQualityScore(node).toFixed(3)),
    successRate: Number(nodeSuccessRate(node).toFixed(4)),
    timeoutRate: Number(nodeTimeoutRate(node).toFixed(4)),
    firstByteP95Ms: numberOrDefault(node.firstByteP95Ms, null),
    firstByteAvgMs: numberOrDefault(node.firstByteAvgMs, null)
  };
}

function routeOptionsFromUrl(url) {
  const deadlineMs = boundedInteger(url.searchParams.get('deadlineMs'), defaultDeadlineMs, 250, 30000);
  const coordinatorBudgetMs = boundedInteger(url.searchParams.get('coordinatorBudgetMs'), defaultCoordinatorBudgetMs, 10, Math.max(10, deadlineMs));
  const firstByteTimeoutMs = boundedInteger(url.searchParams.get('firstByteTimeoutMs'), defaultFirstByteTimeoutMs, 50, Math.max(50, deadlineMs));
  const backupRaceAfterMs = boundedInteger(url.searchParams.get('backupRaceAfterMs'), defaultBackupRaceAfterMs, 25, Math.max(25, deadlineMs));
  const originRaceAfterMs = boundedInteger(url.searchParams.get('originRaceAfterMs'), defaultOriginRaceAfterMs, 50, Math.max(50, deadlineMs));
  const candidateLimit = boundedInteger(url.searchParams.get('candidateLimit'), defaultCandidateLimit, 1, 10);
  return {
    routingMode: url.searchParams.get('mode') || 'hedged-deadline',
    deadlineMs,
    coordinatorBudgetMs,
    firstByteTimeoutMs,
    backupRaceAfterMs,
    originRaceAfterMs,
    candidateLimit
  };
}

function buildRoutePlan(content, options) {
  cleanupStaleNodes();
  const nodeSet = contentNodes.get(content.contentId);
  if (!nodeSet || nodeSet.size === 0) {
    return [];
  }

  const eligibleNodes = [];
  for (const nodeId of nodeSet) {
    const node = nodes.get(nodeId);
    if (!node || !node.microCdnEnabled || node.online === false) {
      continue;
    }
    eligibleNodes.push(node);
  }

  eligibleNodes.sort((left, right) => nodeQualityScore(left) - nodeQualityScore(right));
  return eligibleNodes
    .slice(0, options.candidateLimit)
    .map((node, index) => buildNodeCandidate(node, content, index, options));
}

function pickNodeForContent(contentId) {
  const content = findContent(contentId);
  if (!content) {
    return null;
  }

  const candidates = buildRoutePlan(content, {
    routingMode: 'hedged-deadline',
    deadlineMs: defaultDeadlineMs,
    coordinatorBudgetMs: defaultCoordinatorBudgetMs,
    firstByteTimeoutMs: defaultFirstByteTimeoutMs,
    backupRaceAfterMs: defaultBackupRaceAfterMs,
    originRaceAfterMs: defaultOriginRaceAfterMs,
    candidateLimit: 1
  });

  if (candidates.length === 0) {
    return null;
  }

  return nodes.get(candidates[0].nodeId) || null;
}

async function handleRegisterNode(req, res) {
  const body = await readJson(req);
  if (!requiredString(body.nodeId) || !requiredString(body.publicAddress)) {
    sendJson(res, 400, { error: 'nodeId and publicAddress are required' });
    return;
  }

  const existing = nodes.get(body.nodeId);
  const node = normalizeLoadedNode({
    nodeId: body.nodeId,
    region: requiredString(body.region) ? body.region : 'unknown',
    maxDiskMb: Number.isFinite(body.maxDiskMb) ? body.maxDiskMb : 0,
    maxBandwidthMbps: Number.isFinite(body.maxBandwidthMbps) ? body.maxBandwidthMbps : 0,
    microCdnEnabled: body.microCdnEnabled === true,
    publicAddress: body.publicAddress.replace(/\/$/, ''),
    cacheHits: existing ? existing.cacheHits : 0,
    bytesServed: existing ? existing.bytesServed : 0,
    cachedFiles: existing ? existing.cachedFiles : 0,
    requestCount: existing ? existing.requestCount : 0,
    successCount: existing ? existing.successCount : 0,
    timeoutCount: existing ? existing.timeoutCount : 0,
    errorCount: existing ? existing.errorCount : 0,
    firstByteAvgMs: existing ? existing.firstByteAvgMs : null,
    firstByteP95Ms: existing ? existing.firstByteP95Ms : null,
    online: true,
    lastSeenMs: Date.now(),
    lastSeen: nowIso()
  });

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
  existing.requestCount = Number.isFinite(body.requestCount) ? body.requestCount : existing.requestCount;
  existing.successCount = Number.isFinite(body.successCount) ? body.successCount : existing.successCount;
  existing.timeoutCount = Number.isFinite(body.timeoutCount) ? body.timeoutCount : existing.timeoutCount;
  existing.errorCount = Number.isFinite(body.errorCount) ? body.errorCount : existing.errorCount;
  existing.firstByteAvgMs = Number.isFinite(body.firstByteAvgMs) ? body.firstByteAvgMs : existing.firstByteAvgMs;
  existing.firstByteP95Ms = Number.isFinite(body.firstByteP95Ms) ? body.firstByteP95Ms : existing.firstByteP95Ms;
  existing.lastSeenMs = Date.now();
  existing.lastSeen = nowIso();

  await queueSaveState();
  sendJson(res, 200, { ok: true, node: existing });
}

async function handleNodeReport(req, res) {
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

  const success = body.success === true;
  const timeout = body.timeout === true;
  existing.requestCount += 1;
  if (success) {
    existing.successCount += 1;
  }
  if (timeout) {
    existing.timeoutCount += 1;
  }
  if (!success && !timeout) {
    existing.errorCount += 1;
  }
  if (Number.isFinite(body.firstByteMs)) {
    existing.firstByteAvgMs = existing.firstByteAvgMs === null
      ? body.firstByteMs
      : Math.round((existing.firstByteAvgMs * 0.8) + (body.firstByteMs * 0.2));
    existing.firstByteP95Ms = existing.firstByteP95Ms === null
      ? body.firstByteMs
      : Math.max(body.firstByteMs, Math.round((existing.firstByteP95Ms * 0.95) + (body.firstByteMs * 0.05)));
  }
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

  const namespace = normalizeNamespace(body.namespace || 'default');
  const displayPath = normalizeDisplayPath(body.displayPath || body.contentId, body.contentId);
  const contentId = normalizeContentKey(body.contentId);
  const publicPath = body.publicPath ? `/${cleanPathSegment(body.publicPath)}` : buildPublicPath(namespace, displayPath);
  const existing = approvedContent.get(contentId);
  const content = {
    contentId,
    namespace,
    displayPath,
    publicPath,
    sha256: body.sha256.toLowerCase(),
    url: body.url,
    originUrl: body.originUrl || body.url,
    sizeBytes: Number.isFinite(body.sizeBytes) ? body.sizeBytes : null,
    contentType: requiredString(body.contentType) ? body.contentType : 'application/octet-stream',
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

  const content = findContent(body.contentId);
  if (!content) {
    sendJson(res, 403, { error: 'content is not approved' });
    return;
  }

  let nodeSet = contentNodes.get(content.contentId);
  if (!nodeSet) {
    nodeSet = new Set();
    contentNodes.set(content.contentId, nodeSet);
  }
  nodeSet.add(body.nodeId);

  const node = nodes.get(body.nodeId);
  node.cachedFiles = Math.max(node.cachedFiles, nodeSet.size);
  node.lastSeenMs = Date.now();
  node.lastSeen = nowIso();

  await queueSaveState();
  sendJson(res, 200, { ok: true, contentId: content.contentId, publicPath: content.publicPath, nodeId: body.nodeId });
}

async function handleUnadvertiseContent(req, res) {
  const body = await readJson(req);
  if (!requiredString(body.nodeId) || !requiredString(body.contentId)) {
    sendJson(res, 400, { error: 'nodeId and contentId are required' });
    return;
  }

  if (!nodes.has(body.nodeId)) {
    sendJson(res, 404, { error: 'node is not registered' });
    return;
  }

  const content = findContent(body.contentId);
  const contentId = content ? content.contentId : normalizeContentKey(body.contentId);
  const nodeSet = contentNodes.get(contentId);
  const removed = nodeSet ? nodeSet.delete(body.nodeId) : false;

  if (nodeSet && nodeSet.size === 0) {
    contentNodes.delete(contentId);
  }

  const node = nodes.get(body.nodeId);
  node.cachedFiles = Math.max(0, node.cachedFiles - (removed ? 1 : 0));
  node.lastSeenMs = Date.now();
  node.lastSeen = nowIso();

  await queueSaveState();
  sendJson(res, 200, { ok: true, removed, contentId, nodeId: body.nodeId });
}

function handleRoute(url, res) {
  const requested = url.searchParams.get('contentId') || url.searchParams.get('path');
  if (!requiredString(requested)) {
    sendJson(res, 400, { error: 'contentId or path query parameter is required' });
    return;
  }

  const content = findContent(requested);
  if (!content) {
    sendJson(res, 404, { error: 'content is not approved' });
    return;
  }

  const options = routeOptionsFromUrl(url);
  const candidates = buildRoutePlan(content, options);
  if (candidates.length === 0) {
    sendJson(res, 404, { error: 'no healthy node currently serves this content' });
    return;
  }

  const primary = candidates[0];
  sendJson(res, 200, {
    contentId: content.contentId,
    namespace: content.namespace,
    displayPath: content.displayPath,
    publicPath: content.publicPath,
    sha256: content.sha256,
    routingMode: options.routingMode,
    deadlineMs: options.deadlineMs,
    coordinatorBudgetMs: options.coordinatorBudgetMs,
    firstByteTimeoutMs: options.firstByteTimeoutMs,
    backupRaceAfterMs: options.backupRaceAfterMs,
    selectedNode: {
      nodeId: primary.nodeId,
      region: primary.region,
      downloadUrl: primary.downloadUrl
    },
    candidates,
    originFallback: {
      enabled: requiredString(content.originUrl),
      raceAfterMs: options.originRaceAfterMs,
      url: content.originUrl || content.url || null
    }
  });
}

function handleStatus(res) {
  cleanupStaleNodes();
  sendJson(res, 200, {
    ok: true,
    persistent: true,
    stateFile,
    routeDefaults: {
      routingMode: 'hedged-deadline',
      deadlineMs: defaultDeadlineMs,
      coordinatorBudgetMs: defaultCoordinatorBudgetMs,
      firstByteTimeoutMs: defaultFirstByteTimeoutMs,
      backupRaceAfterMs: defaultBackupRaceAfterMs,
      originRaceAfterMs: defaultOriginRaceAfterMs,
      candidateLimit: defaultCandidateLimit
    },
    nodes: [...nodes.values()].map(node => ({
      nodeId: node.nodeId,
      region: node.region,
      publicAddress: node.publicAddress,
      microCdnEnabled: node.microCdnEnabled,
      online: node.online !== false,
      cacheHits: node.cacheHits,
      bytesServed: node.bytesServed,
      cachedFiles: node.cachedFiles,
      requestCount: node.requestCount,
      successCount: node.successCount,
      timeoutCount: node.timeoutCount,
      errorCount: node.errorCount,
      firstByteAvgMs: node.firstByteAvgMs,
      firstByteP95Ms: node.firstByteP95Ms,
      qualityScore: Number(nodeQualityScore(node).toFixed(3)),
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

    if (req.method === 'POST' && url.pathname === '/nodes/report') {
      await handleNodeReport(req, res);
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

    if (req.method === 'POST' && url.pathname === '/content/unadvertise') {
      await handleUnadvertiseContent(req, res);
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
