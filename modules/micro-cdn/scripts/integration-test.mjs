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
const outputDir = path.join(workDir, 'output');
const coordinatorUrl = 'http://127.0.0.1:18080';
const nodeUrl = 'http://127.0.0.1:18081';
const slowNodeUrl = 'http://127.0.0.1:18082';
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

    await testSmokeFlow();
    await testBadHashRejection();

    await stopProcess(node);
    await stopProcess(coordinator);

    coordinator = await startCoordinator();
    node = await startNode();

    await waitForHttp(coordinatorUrl + '/status');
    await waitForHttp(nodeUrl + '/health');
    await sleep(1500);

    await testRestartPersistence();
    await testDeleteAndUnadvertise();
    await testTwoNodeHedgedFailover();

    console.log('micro cdn integration tests passed');
  } finally {
    await stopAllProcesses();
  }
}

async function prepareWorkDir() {
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(coordinatorDir, { recursive: true });
  await fs.mkdir(nodeDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

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

async function startSlowNodeFixture() {
  const child = spawn(process.execPath, [path.resolve(moduleDir, 'scripts', 'slow-node-fixture.mjs')], {
    cwd: workDir,
    env: {
      ...process.env,
      PORT: '18082',
      RESPONSE_DELAY_MS: '500',
      CONTENT_PATH: publicPath,
      FILE_PATH: assetPath
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  trackProcess(child, 'slow-node');
  await waitForOutput(child, 'slow node fixture listening');
  return child;
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

async function testRestartPersistence() {
  const route = await getJson(coordinatorUrl + '/route?path=' + encodeURIComponent(publicPath));
  assert.equal(route.contentId, contentId);
  assert.equal(route.selectedNode.nodeId, 'node-001');

  const text = await getText(nodeUrl + publicPath);
  const original = await fs.readFile(assetPath, 'utf8');
  assert.equal(text, original);

  const manifest = await getJson(nodeUrl + '/manifest');
  assert.equal(manifest.cachedContent.length, 1);
  assert.equal(manifest.cachedContent[0].contentId, contentId);
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
  assert.match(routeAfterDelete.body.error, /no healthy node currently serves this content/);
}

async function testTwoNodeHedgedFailover() {
  await approveContent();

  await postJson(coordinatorUrl + '/nodes/register', {
    nodeId: 'node-slow',
    region: 'local-dev',
    maxDiskMb: 128,
    maxBandwidthMbps: 25,
    microCdnEnabled: true,
    publicAddress: slowNodeUrl
  });

  await postJson(coordinatorUrl + '/content/advertise', {
    nodeId: 'node-slow',
    contentId
  });

  await postJson(nodeUrl + '/cache/local-file', {
    contentId,
    namespace,
    displayPath,
    sourcePath: assetPath,
    sha256: expectedSha256,
    contentType: 'text/plain'
  });

  const slowNode = await startSlowNodeFixture();
  await waitForHttp(slowNodeUrl + '/health');

  const route = await getJson(coordinatorUrl + '/route?path=' + encodeURIComponent(publicPath) + '&candidateLimit=2&firstByteTimeoutMs=250&backupRaceAfterMs=75&deadlineMs=1200');
  assert.equal(route.candidates.length, 2);
  assert.equal(route.candidates[0].nodeId, 'node-slow');
  assert.equal(route.candidates[0].role, 'primary');
  assert.equal(route.candidates[1].nodeId, 'node-001');
  assert.equal(route.candidates[1].role, 'backup');

  const hedgedOutput = path.join(outputDir, 'downloaded-hedged-hello.txt');
  const hedged = await runHedgedFetch(hedgedOutput);
  assert.equal(hedged.ok, true);
  assert.equal(hedged.winner.nodeId, 'node-001');
  assert.equal(hedged.winner.role, 'backup');
  assert.equal(hedged.winner.sha256, expectedSha256);

  const downloadedHash = await hashFile(hedgedOutput);
  assert.equal(downloadedHash, expectedSha256);

  await sleep(500);
  const status = await getJson(coordinatorUrl + '/status');
  const fast = status.nodes.find(node => node.nodeId === 'node-001');
  const slow = status.nodes.find(node => node.nodeId === 'node-slow');

  assert.equal(fast.successCount >= 1, true);
  assert.equal(slow.timeoutCount >= 1, true);
  assert.equal(slow.successCount, 0);

  await stopProcess(slowNode);
}

async function approveContent() {
  const approved = await postJson(coordinatorUrl + '/content/approve', {
    contentId,
    namespace,
    displayPath,
    sha256: expectedSha256,
    url: 'local-demo://hello.txt',
    originUrl: 'local-demo://hello.txt',
    contentType: 'text/plain',
    maxAgeSeconds: 86400
  });

  assert.equal(approved.ok, true);
  assert.equal(approved.content.publicPath, publicPath);
}

async function runHedgedFetch(outputFile) {
  const child = spawn(process.execPath, [path.resolve(moduleDir, 'scripts', 'hedged-fetch.mjs'), publicPath, outputFile], {
    cwd: workDir,
    env: {
      ...process.env,
      COORDINATOR_URL: coordinatorUrl,
      CANDIDATE_LIMIT: '2',
      FIRST_BYTE_TIMEOUT_MS: '250',
      BACKUP_RACE_AFTER_MS: '75',
      DEADLINE_MS: '1200'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  const exitCode = await waitForExit(child, 5000);
  assert.equal(exitCode, 0, stderr || stdout);
  return JSON.parse(stdout);
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
  return {
    status: response.status,
    body
  };
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
  return {
    status: response.status,
    body
  };
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
