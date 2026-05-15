# Micro CDN Test Runbook

## Purpose

This file exists so a future assistant or contributor can quickly reproduce the local micro CDN prototype test without rebuilding the process from scratch.

The current tested model uses:

```text
Coordinator identity: demo/hello.txt
Public CDN path: /mcdn/demo/hello.txt
Node storage path: cache/sha256/{first-two-hash-chars}/{full-sha256}
```

## Instructions for future AI assistants

When asked to test this module, do not rely on memory or prior chat context. Use this runbook as the source of truth for the local setup.

Recommended approach:

```text
1. Use a clean temporary test folder outside the repository checkout.
2. Copy only the needed micro CDN files into that folder.
3. Use alternate ports 18080, 18081, and 18082 unless the user specifically wants the default ports.
4. Start the coordinator before starting any node.
5. Start the normal node agent as the fast node.
6. Start the slow node fixture only for hedged failover tests.
7. Run the basic lifecycle test first.
8. Run the restart persistence test second.
9. Run the delete and unadvertise test third.
10. Run the two node hedged failover test last.
11. If a test fails, capture the exact command, response body, and log section before changing code.
12. Update TEST_RESULTS.md after any successful new test pass or after fixing a bug found by testing.
```

Use these process roles:

```text
coordinator: tracks approved content, nodes, mappings, route plans, quality scores
fast node: normal node agent serving cached content from /mcdn paths
slow node: fixture node with intentional response delay to prove backup racing
hedged client: scripts/hedged-fetch.mjs, consumes /route candidates and picks the first valid response
```

Use these ports unless they conflict:

```text
coordinator: 18080
fast node: 18081
slow node fixture: 18082
```

A future assistant should prefer running the existing scripts before hand rebuilding curl calls:

```text
scripts/smoke-test.ps1
scripts/delete-test.ps1
scripts/two-node-failover-test.ps1
scripts/hedged-fetch.mjs
scripts/slow-node-fixture.mjs
```

Only hand rebuild the test if the scripts are broken or if the environment cannot run PowerShell.

## What the test proves

The local test verifies that the prototype can:

```text
start coordinator
start node agent
register node
approve public content path
cache local file
verify SHA256
store bytes by hash
advertise content
route by public path
serve through /mcdn path
update manifest hits
persist coordinator state
persist node manifest
restart and recover
re advertise after restart
delete by public path
unadvertise after delete
fail route after no nodes remain
return deadline based candidate route plan
race backup candidate
verify hash
report node timing result
update coordinator quality stats
```

## Default ports

The repository defaults are:

```text
coordinator: 8080
node agent: 8081
```

In this environment, port 8080 was already occupied, so the successful test used:

```text
coordinator: 18080
node agent: 18081
slow node fixture: 18082
```

Using alternate ports is valid because the same coordinator and node code paths are exercised.

## Fast manual setup

Create a temporary working folder outside the repo checkout.

```bash
mkdir -p /mnt/data/mcdn-fresh/coordinator/src
mkdir -p /mnt/data/mcdn-fresh/node-agent/src
mkdir -p /mnt/data/mcdn-fresh/demo-assets
mkdir -p /mnt/data/mcdn-fresh/scripts
```

Copy the current repository files into the test folder:

```text
modules/micro-cdn/coordinator/src/index.js
modules/micro-cdn/node-agent/src/index.js
modules/micro-cdn/demo-assets/hello.txt
modules/micro-cdn/scripts/hedged-fetch.mjs
modules/micro-cdn/scripts/slow-node-fixture.mjs
```

Create coordinator package file:

```json
{
  "type": "module"
}
```

Create node package file:

```json
{
  "type": "module"
}
```

Create node config at:

```text
/mnt/data/mcdn-fresh/node-agent/config.local.json
```

Use this content:

```json
{
  "nodeId": "node-001",
  "region": "local-dev",
  "port": 18081,
  "coordinatorUrl": "http://127.0.0.1:18080",
  "publicAddress": "http://127.0.0.1:18081",
  "microCdnEnabled": true,
  "cacheDir": "./cache",
  "manifestFile": "./cache/manifest.json",
  "maxDiskMb": 128,
  "maxBandwidthMbps": 25,
  "heartbeatSeconds": 2
}
```

## Clean environment before each test

Before a fresh test run, remove old state and old cache files.

```bash
rm -rf /mnt/data/mcdn-fresh/coordinator/data
rm -rf /mnt/data/mcdn-fresh/node-agent/cache
rm -f /mnt/data/mcdn-fresh/downloaded-hello.txt
rm -f /mnt/data/mcdn-fresh/downloaded-hedged-hello.txt
```

If previous node processes are still running, stop them before starting a new test. Prefer stopping only the test processes you started. Avoid killing unrelated system processes.

## Start coordinator

From the coordinator folder:

```bash
cd /mnt/data/mcdn-fresh/coordinator
PORT=18080 DATA_DIR=./data node src/index.js
```

Expected startup output on first run:

```text
no coordinator state found at data/coordinator-state.json; starting empty
micro cdn coordinator listening on http://127.0.0.1:18080
coordinator state file: data/coordinator-state.json
```

Expected startup output after restart:

```text
loaded coordinator state from data/coordinator-state.json
micro cdn coordinator listening on http://127.0.0.1:18080
coordinator state file: data/coordinator-state.json
```

## Start node agent

From the node agent folder:

```bash
cd /mnt/data/mcdn-fresh/node-agent
CONFIG=./config.local.json node src/index.js
```

Expected startup output on first run:

```text
no node cache manifest found at /mnt/data/mcdn-fresh/node-agent/cache/manifest.json; starting empty
micro cdn node agent listening on http://127.0.0.1:18081
node cache manifest: /mnt/data/mcdn-fresh/node-agent/cache/manifest.json
```

Expected startup output after restart:

```text
loaded node cache manifest from /mnt/data/mcdn-fresh/node-agent/cache/manifest.json
micro cdn node agent listening on http://127.0.0.1:18081
node cache manifest: /mnt/data/mcdn-fresh/node-agent/cache/manifest.json
```

## Run the basic test from a third terminal

Set common variables:

```bash
COORDINATOR=http://127.0.0.1:18080
NODE=http://127.0.0.1:18081
ASSET=/mnt/data/mcdn-fresh/demo-assets/hello.txt
NAMESPACE=demo
DISPLAY_PATH=hello.txt
CONTENT_ID=demo/hello.txt
PUBLIC_PATH=/mcdn/demo/hello.txt
SHA256=$(sha256sum "$ASSET" | awk '{print $1}')
```

Approve content:

```bash
curl -sS -X POST "$COORDINATOR/content/approve" \
  -H "content-type: application/json" \
  -d "{\"contentId\":\"$CONTENT_ID\",\"namespace\":\"$NAMESPACE\",\"displayPath\":\"$DISPLAY_PATH\",\"sha256\":\"$SHA256\",\"url\":\"local-demo://hello.txt\",\"originUrl\":\"local-demo://hello.txt\",\"contentType\":\"text/plain\",\"maxAgeSeconds\":86400}"
```

Cache local file on the node:

```bash
curl -sS -X POST "$NODE/cache/local-file" \
  -H "content-type: application/json" \
  -d "{\"contentId\":\"$CONTENT_ID\",\"namespace\":\"$NAMESPACE\",\"displayPath\":\"$DISPLAY_PATH\",\"sourcePath\":\"$ASSET\",\"sha256\":\"$SHA256\",\"contentType\":\"text/plain\"}"
```

Route by public path:

```bash
curl -sS "$COORDINATOR/route?path=%2Fmcdn%2Fdemo%2Fhello.txt"
```

Expected route fields:

```text
contentId: demo/hello.txt
publicPath: /mcdn/demo/hello.txt
downloadUrl: http://127.0.0.1:18081/mcdn/demo/hello.txt
candidates: at least one item
selectedNode: kept for backward compatibility
```

Download from node:

```bash
curl -sS "$NODE/mcdn/demo/hello.txt"
```

Expected file content:

```text
Hello from the after-cloudflare optional micro CDN prototype.

This is a boring static file used to prove the first local cache flow works.
```

Wait briefly before checking manifest hits:

```bash
sleep 1
curl -sS "$NODE/manifest"
```

Expected manifest facts:

```text
contentId: demo/hello.txt
publicPath: /mcdn/demo/hello.txt
sha256: 6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7
hits: at least 1
```

Expected hash storage path:

```text
/mnt/data/mcdn-fresh/node-agent/cache/sha256/6a/6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7
```

## Restart persistence test

Stop both node and coordinator processes.

Start the coordinator again:

```bash
cd /mnt/data/mcdn-fresh/coordinator
PORT=18080 DATA_DIR=./data node src/index.js
```

Start the node again:

```bash
cd /mnt/data/mcdn-fresh/node-agent
CONFIG=./config.local.json node src/index.js
```

Wait briefly for node registration and re advertisement:

```bash
sleep 2
```

Route again:

```bash
curl -sS "$COORDINATOR/route?path=%2Fmcdn%2Fdemo%2Fhello.txt"
```

Download again:

```bash
curl -sS "$NODE/mcdn/demo/hello.txt"
```

Expected result:

```text
route succeeds after restart
download succeeds after restart
```

## Delete test

Delete by public path:

```bash
curl -sS -X DELETE "$NODE/mcdn/demo/hello.txt"
```

Check manifest:

```bash
curl -sS "$NODE/manifest"
```

Expected manifest:

```text
cachedContent: []
```

Check coordinator status:

```bash
curl -sS "$COORDINATOR/status"
```

Expected mapping:

```text
contentNodes: []
```

Route after delete:

```bash
curl -sS -i "$COORDINATOR/route?path=%2Fmcdn%2Fdemo%2Fhello.txt"
```

Expected result:

```text
HTTP status: 404
message: no healthy node currently serves this content
```

## Two node hedged failover environment

The two node test uses one real node agent and one intentionally slow fixture node.

Start the slow fixture from the test root:

```bash
cd /mnt/data/mcdn-fresh
PORT=18082 RESPONSE_DELAY_MS=500 FILE_PATH=/mnt/data/mcdn-fresh/demo-assets/hello.txt node scripts/slow-node-fixture.mjs
```

The fixture serves:

```text
http://127.0.0.1:18082/mcdn/demo/hello.txt
```

The fixture intentionally waits before responding so the hedged client can prove the backup path wins.

## Two node hedged failover test

Use these values:

```text
coordinator: http://127.0.0.1:18080
fast node: http://127.0.0.1:18081
slow node: http://127.0.0.1:18082
slow node delay: 500 ms
first byte timeout: 250 ms
backup race delay: 75 ms
deadline: 1200 ms
```

Manual flow:

```text
1. Approve demo/hello.txt.
2. Register node-slow with publicAddress http://127.0.0.1:18082.
3. Advertise demo/hello.txt for node-slow first.
4. Cache demo/hello.txt on node-001.
5. Request /route with candidateLimit=2, firstByteTimeoutMs=250, backupRaceAfterMs=75, deadlineMs=1200.
6. Run hedged-fetch.mjs for /mcdn/demo/hello.txt.
7. Verify winner is node-001 with role backup.
8. Verify output file SHA256 matches expected hash.
9. Check /status for node-001 success and node-slow timeout.
```

Run the hedged client manually:

```bash
cd /mnt/data/mcdn-fresh
COORDINATOR_URL=http://127.0.0.1:18080 CANDIDATE_LIMIT=2 FIRST_BYTE_TIMEOUT_MS=250 BACKUP_RACE_AFTER_MS=75 DEADLINE_MS=1200 node scripts/hedged-fetch.mjs /mcdn/demo/hello.txt /mnt/data/mcdn-fresh/downloaded-hedged-hello.txt
```

Expected hedged output:

```json
{
  "ok": true,
  "routingMode": "hedged-deadline",
  "publicPath": "/mcdn/demo/hello.txt",
  "winner": {
    "role": "backup",
    "nodeId": "node-001",
    "url": "http://127.0.0.1:18081/mcdn/demo/hello.txt",
    "firstByteMs": 5,
    "bytes": 140,
    "sha256": "6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7"
  },
  "candidatesReceived": 2,
  "outputFile": "/mnt/data/mcdn-fresh/downloaded-hedged-hello.txt"
}
```

The exact firstByteMs can vary. The important facts are:

```text
ok is true
winner role is backup
winner nodeId is node-001
sha256 matches expected hash
```

Expected coordinator reports after hedged fetch:

```json
[
  {
    "nodeId": "node-001",
    "success": true,
    "timeout": false,
    "firstByteMs": 5
  },
  {
    "nodeId": "node-slow",
    "success": false,
    "timeout": true,
    "firstByteMs": 250
  }
]
```

## Known timing detail

The node manifest hit count updates after the file stream finishes.

If a test checks the manifest immediately after downloading, the hit count may appear unchanged for a moment.

Use a short wait before validating hits:

```bash
sleep 1
```

The hedged failover test also depends on timing. The slow node fixture uses an intentional response delay so the backup race path can be verified deterministically.

## Fast pass criteria

A future test pass should be considered successful when these are true:

```text
route returns /mcdn/demo/hello.txt
node serves /mcdn/demo/hello.txt
manifest lists demo/hello.txt
manifest stores publicPath /mcdn/demo/hello.txt
manifest hit count increments
cache file exists under cache/sha256/6a/fullhash
route succeeds after coordinator and node restart
DELETE /mcdn/demo/hello.txt empties manifest
route returns 404 after delete
coordinator contentNodes is empty after delete
route returns candidates array
hedged fetch returns ok true
hedged fetch winner is node-001
hedged fetch winner role is backup when slow node is primary
coordinator reports success for node-001
coordinator reports timeout for node-slow
```

## Common failure points

### Port already in use

Use alternate ports such as 18080 and 18081.

### Node starts before coordinator

The node may log startup registration failure. Start the coordinator first, then restart the node.

### Route fails immediately after node restart

Wait briefly for the node to re advertise manifest content.

### Manifest hit count does not increment immediately

Wait for the stream completion handler to run before checking `/manifest`.

### Delete succeeds locally but route still works

Check whether another node is still advertising the same content ID.

### Hedged fetch says slow node won

Confirm the slow node was started with RESPONSE_DELAY_MS=500 and the route used firstByteTimeoutMs=250.

### Slow node reports both timeout and success

This was a bug found during testing and fixed in hedged-fetch.mjs. Each candidate should now report only once.

## Current tested values

```text
contentId: demo/hello.txt
publicPath: /mcdn/demo/hello.txt
sha256: 6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7
fast node: node-001
slow node: node-slow
coordinator test port: 18080
fast node test port: 18081
slow node test port: 18082
```
