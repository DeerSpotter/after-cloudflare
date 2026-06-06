import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const moduleDir = path.resolve(scriptDir, '..');
const workDir = path.resolve(moduleDir, '.tmp-integration');
const coordinatorDir = path.join(workDir, 'coordinator');
const nodeDir = path.join(workDir, 'node-agent');
const coordinatorUrl = 'http://127.0.0.1:18080';
const nodeUrl = 'http://127.0.0.1:18081';
const contentId = 'demo/hello.txt';
const namespace = 'demo';
const displayPath = 'hello.txt';
const publicPath = '/mcdn/demo/hello.txt';
const assetPath = path.resolve(moduleDir, 'demo-assets', 'hello.txt');
const expectedSha256 = '6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7';
const processes = [];

async function main() {
  try {
    await prepareWorkDir();
    let coordinator = await startCoordinator();
    let node = await startNode();

    await waitForHttp(coordinatorUrl + '/status');
    await waitForHttp(nodeUrl + '/health');

    await testInvalidApprovalRejection();
    await testExpiredApprovalRejection();
    await testSmokeFlow();
    await testBadHashRejection();
    await testDeleteAndUnadvertise();

    await stopProcess(node);
    await stopProcess(coordinator);

    coordinator = await startCoordinator();
    node = await startNode();

    await waitForHttp(coordinatorUrl + '/status');
    await waitForHttp(nodeUrl + '/health');
    await sleep(1500);
    await testRestartPersistence();

    console.log('micro cdn integration tests passed');
  } finally {
    await stopAllProcesses();
  }
}

async function prepareWorkDir() {
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(coordinatorDir, { recursive: true });
  await fs.mkdir(nodeDir, { recursive: true });

  const config = {
    nodeId: 'node-001',
    region: 'local-dev',
    port: 18081,
    coordinatorUrl,
    publicAddress: nodeUrl,
    microCdnEnabled: true,
    cacheDir: path.join(nodeDir, 'cache'),
    manifestFile: path.join(nodeDir, 'cache', 'manifest.json'),
    maxDiskMb: 128,
    maxBandwidthMbps: 25,
    heartbeatSeconds: 1
  };

  await fs.writeFile(path.join(nodeDir, 'config.local.json'), JSON.stringify(config, null, 2), 'utf8');
}

async function startCoordinator() {
  const child = spawn(process.execPath, [path.resolve(moduleDir, 'coordinator', 'src', 'index.js')], {
    cwd: coordinatorDir,
    env: {
      ...process.env,
      PORT: '18080',
      DATA_DIR: path.join(coordinatorDir, 'data'),
      NODE_TTL_MS: '30000'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  trackProcess(child, 'coordinator');
  await waitForOutput(child, 'micro cdn coordinator listening');
  return child;
}

async function startNode() {
  const child = spawn(process.execPath, [path.resolve(moduleDir, 'node-agent', 'src', 'index.js')], {
    cwd: nodeDir,
    env: {
      ...process.env,
      CONFIG: path.join(nodeDir, 'config.local.json')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  trackProcess(child, 'node-agent');
  await waitForOutput(child, 'micro cdn node agent listening');
  return child;
}

async function testInvalidApprovalRejection() {
  const rejected = await postJsonAllowFailure(coordinatorUrl + '/content/approve', {
    contentId: 'demo/bad-origin.txt',
    namespace,
    displayPath: 'bad-origin.txt',
    sha256: expectedSha256,
    url: 'local-demo://bad-origin.txt',
    originUrl: 'local-demo://bad-origin.txt',
    contentType: 'text/plain'
  });

  assert.equal(rejected.status, 400);
  assert.ok(rejected.body.reasonCodes.includes('INVALID_ORIGIN_URL'));
}

async function testExpiredApprovalRejection() {
  const rejected = await postJsonAllowFailure(coordinatorUrl + '/content/approve', {
    contentId: 'demo/expired.txt',
    namespace,
    displayPath: 'expired.txt',
    sha256: expectedSha256,
    url: 'https://origin.example.test/expired.txt',
    originUrl: 'https://origin.example.test/expired.txt',
    contentType: 'text/plain',
    expiresAt: '2020-01-01T00:00:00Z'
  });

  assert.equal(rejected.status, 400);
  assert.ok(rejected.body.reasonCodes.includes('APPROVAL_EXPIRED'));
}

async function testSmokeFlow() {
  await approveContent();
  const cacheResponse = await postJson(nodeUrl + '/cache/local-file', {
    contentId,
    namespace,
    displayPath,
    sourcePath: assetPath,
    sha256: expectedSha256,
    contentType: 'text/plain'
  });

  assert.equal(cacheResponse.ok, true);
  assert.equal(cacheResponse.result.publicPath, publicPath);
  assert.equal(cacheResponse.result.sha256, expectedSha256);

  const route = await getJson(coordinatorUrl + '/route?path=' + encodeURIComponent(publicPath));
  assert.equal(route.contentId, contentId);
  assert.equal(route.publicPath, publicPath);
  assert.equal(route.selectedNode.nodeId, 'node-001');
  assert.ok(route.reasonCodes.includes('CONTENT_APPROVED'));
  assert.ok(route.reasonCodes.includes('APPROVAL_NOT_EXPIRED'));
  assert.ok(route.reasonCodes.includes('HASH_AVAILABLE'));
  assert.ok(route.selectedNode.reasonCodes.includes('NODE_ADVERTISES_CONTENT'));
  assert.ok(Array.isArray(route.candidates));
  assert.ok(route.candidates.length >= 1);

  const text = await getText(nodeUrl + publicPath);
  const original = await fs.readFile(assetPath, 'utf8');
  assert.equal(text, original);

  await sleep(500);
  const manifest = await getJson(nodeUrl + '/manifest');
  assert.equal(manifest.cachedContent.length, 1);
  assert.equal(manifest.cachedContent[0].contentId, contentId);
  assert.equal(manifest.cachedContent[0].publicPath, publicPath);
  assert.equal(manifest.cachedContent[0].sha256, expectedSha256);
  assert.ok(manifest.cachedContent[0].hits >= 1);

  const storedFile = path.join(nodeDir, 'cache', 'sha256', expectedSha256.slice(0, 2), expectedSha256);
  const storedHash = await hashFile(storedFile);
  assert.equal(storedHash, expectedSha256);
}

async function testBadHashRejection() {
  const badResponse = await postJsonAllowFailure(nodeUrl + '/cache/local-file', {
    contentId: 'demo/bad-hash.txt',
    namespace,
    displayPath: 'bad-hash.txt',
    sourcePath: assetPath,
    sha256: '0000000000000000000000000000000000000000000000000000000000000000',
    contentType: 'text/plain'
  });

  assert.equal(badResponse.status, 500);
  assert.match(badResponse.body.error, /hash mismatch/);

  const status = await getJson(coordinatorUrl + '/status');
  const advertisedBadContent = status.contentNodes.some(item => item.contentId === 'demo/bad-hash.txt');
  assert.equal(advertisedBadContent, false);
}

async function testDeleteAndUnadvertise() {
  const deleteResult = await deleteJson(nodeUrl + publicPath);
  assert.equal(deleteResult.ok, true);
  assert.equal(deleteResult.result.removedManifestEntry, true);

  const manifest = await getJson(nodeUrl + '/manifest');
  assert.equal(manifest.cachedContent.length, 0);

  await sleep(500);
  const status = await getJson(coordinatorUrl + '/status');
  const mapping = status.contentNodes.find(item => item.contentId === contentId);
  assert.equal(mapping, undefined);

  const routeAfterDelete = await getJsonAllowFailure(coordinatorUrl + '/route?path=' + encodeURIComponent(publicPath));
  assert.equal(routeAfterDelete.status, 404);
  assert.ok(routeAfterDelete.body.reasonCodes.includes('NO_HEALTHY_NODE'));
}

async function testRestartPersistence() {
  await postJson(nodeUrl + '/cache/local-file', {
    contentId,
    namespace,
    displayPath,
    sourcePath: assetPath,
    sha256: expectedSha256,
    contentType: 'text/plain'
  });

  await sleep(500);
  const route = await getJson(coordinatorUrl + '/route?path=' + encodeURIComponent(publicPath));
  assert.equal(route.contentId, contentId);
  assert.equal(route.selectedNode.nodeId, 'node-001');
  assert.ok(route.reasonCodes.includes('CONTENT_APPROVED'));

  const text = await getText(nodeUrl + publicPath);
  const original = await fs.readFile(assetPath, 'utf8');
  assert.equal(text, original);
}

async function approveContent() {
  const approved = await postJson(coordinatorUrl + '/content/approve', {
    contentId,
    namespace,
    displayPath,
    sha256: expectedSha256,
    url: 'https://origin.example.test/hello.txt',
    originUrl: 'https://origin.example.test/hello.txt',
    contentType: 'text/plain',
    sizeBytes: 13,
    maxAgeSeconds: 86400
  });

  assert.equal(approved.ok, true);
  assert.equal(approved.content.publicPath, publicPath);
  assert.equal(approved.content.originUrl, 'https://origin.example.test/hello.txt');
  assert.ok(approved.reasonCodes.includes('CONTENT_APPROVED'));
}

function trackProcess(child, label) {
  child.__label = label;
  processes.push(child);
  child.stdout.on('data', chunk => {
    process.stdout.write('[' + label + '] ' + chunk.toString());
  });
  child.stderr.on('data', chunk => {
    process.stderr.write('[' + label + '] ' + chunk.toString());
  });
}

async function stopAllProcesses() {
  while (processes.length > 0) {
    const child = processes.pop();
    await stopProcess(child);
  }
}

async function stopProcess(child) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  try {
    await waitForExit(child, 2000);
  } catch {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }
}

function waitForOutput(child, text, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled === true) {
        return;
      }
      settled = true;
      reject(new Error('timeout waiting for ' + text));
    }, timeoutMs);

    function onData(chunk) {
      if (settled === true) {
        return;
      }
      if (chunk.toString().includes(text)) {
        settled = true;
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve();
      }
    }

    child.stdout.on('data', onData);
    child.once('exit', code => {
      if (settled === true) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(new Error('process exited before output ' + text + ' with code ' + code));
    });
  });
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error('timeout waiting for process exit'));
    }, timeoutMs);
    child.once('exit', code => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function waitForHttp(url, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await sleep(100);
    }
    await sleep(100);
  }
  throw new Error('timeout waiting for ' + url);
}

async function getJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
}

async function getJsonAllowFailure(url) {
  const response = await fetch(url);
  const body = await response.json();
  return { status: response.status, body };
}

async function getText(url) {
  const response = await fetch(url);
  const body = await response.text();
  assert.equal(response.ok, true, body);
  return body;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
}

async function postJsonAllowFailure(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function deleteJson(url) {
  const response = await fetch(url, { method: 'DELETE' });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
}

async function hashFile(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

main().catch(async err => {
  console.error(err);
  await stopAllProcesses();
  process.exitCode = 1;
});
