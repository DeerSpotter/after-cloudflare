import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';

const coordinatorUrl = process.env.COORDINATOR_URL || 'http://127.0.0.1:8080';
const contentPath = process.env.CONTENT_PATH || process.argv[2] || '/mcdn/demo/hello.txt';
const outputFile = process.env.OUTPUT_FILE || process.argv[3] || '';
const deadlineMs = Number.parseInt(process.env.DEADLINE_MS || '1200', 10);
const candidateLimit = Number.parseInt(process.env.CANDIDATE_LIMIT || '3', 10);
const firstByteTimeoutMs = Number.parseInt(process.env.FIRST_BYTE_TIMEOUT_MS || '250', 10);
const backupRaceAfterMs = Number.parseInt(process.env.BACKUP_RACE_AFTER_MS || '75', 10);
const originRaceAfterMs = Number.parseInt(process.env.ORIGIN_RACE_AFTER_MS || '300', 10);

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');
}

async function postJson(url, payload) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function reportNode(candidate, success, timeout, firstByteMs) {
  if (!candidate || !candidate.nodeId) {
    return;
  }

  await postJson(`${coordinatorUrl.replace(/\/$/, '')}/nodes/report`, {
    nodeId: candidate.nodeId,
    success,
    timeout,
    firstByteMs: Number.isFinite(firstByteMs) ? Math.round(firstByteMs) : undefined
  });
}

function routeUrl() {
  const url = new URL('/route', coordinatorUrl.replace(/\/$/, ''));
  url.searchParams.set('path', contentPath);
  url.searchParams.set('deadlineMs', String(deadlineMs));
  url.searchParams.set('candidateLimit', String(candidateLimit));
  url.searchParams.set('firstByteTimeoutMs', String(firstByteTimeoutMs));
  url.searchParams.set('backupRaceAfterMs', String(backupRaceAfterMs));
  url.searchParams.set('originRaceAfterMs', String(originRaceAfterMs));
  return url;
}

async function getRoutePlan() {
  const response = await fetch(routeUrl());
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`route failed ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function fetchCandidate(candidate, routePlan) {
  const delayMs = Number.isFinite(candidate.raceAfterMs) ? candidate.raceAfterMs : 0;
  await sleep(delayMs);

  const startedAt = performance.now();
  const timeoutMs = Number.isFinite(candidate.firstByteTimeoutMs)
    ? candidate.firstByteTimeoutMs
    : routePlan.firstByteTimeoutMs;

  const timeoutPromise = sleep(timeoutMs).then(() => {
    throw new Error('first byte timeout');
  });

  const fetchPromise = fetch(candidate.downloadUrl).then(async response => {
    const firstByteMs = performance.now() - startedAt;
    if (!response.ok) {
      await reportNode(candidate, false, false, firstByteMs);
      throw new Error(`${candidate.nodeId} returned HTTP ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const actualHash = sha256(buffer);
    if (actualHash !== routePlan.sha256) {
      await reportNode(candidate, false, false, firstByteMs);
      throw new Error(`${candidate.nodeId} returned SHA256 ${actualHash}`);
    }

    await reportNode(candidate, true, false, firstByteMs);
    return {
      candidate,
      firstByteMs,
      buffer,
      sha256: actualHash,
      bytes: buffer.byteLength
    };
  });

  try {
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (err) {
    const timeout = err instanceof Error && err.message === 'first byte timeout';
    await reportNode(candidate, false, timeout, performance.now() - startedAt);
    throw err;
  }
}

async function hedgedFetch(routePlan) {
  const candidates = Array.isArray(routePlan.candidates) ? routePlan.candidates : [];
  if (candidates.length === 0) {
    throw new Error('route plan did not include candidates');
  }

  const attempts = candidates.map(candidate => fetchCandidate(candidate, routePlan));
  const deadline = sleep(routePlan.deadlineMs || deadlineMs).then(() => {
    throw new Error('deadline exceeded');
  });

  return Promise.any([...attempts, deadline]);
}

async function writeOutput(result) {
  if (!outputFile) {
    return;
  }

  await fs.mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
  await fs.writeFile(outputFile, Buffer.from(result.buffer));
}

async function main() {
  const routePlan = await getRoutePlan();
  const result = await hedgedFetch(routePlan);
  await writeOutput(result);

  console.log(JSON.stringify({
    ok: true,
    routingMode: routePlan.routingMode,
    publicPath: routePlan.publicPath,
    winner: {
      role: result.candidate.role,
      nodeId: result.candidate.nodeId,
      url: result.candidate.downloadUrl,
      firstByteMs: Math.round(result.firstByteMs),
      bytes: result.bytes,
      sha256: result.sha256
    },
    candidatesReceived: routePlan.candidates.length,
    outputFile: outputFile || null
  }, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({
    ok: false,
    error: err instanceof Error ? err.message : String(err)
  }, null, 2));
  process.exitCode = 1;
});
