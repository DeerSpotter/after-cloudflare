# Micro CDN Test Runbook

## Purpose

This file exists so a future assistant or contributor can quickly reproduce the local micro CDN prototype test without rebuilding the process from scratch.

The current tested model uses:

```text
Coordinator identity: demo/hello.txt
Public CDN path: /mcdn/demo/hello.txt
Node storage path: cache/sha256/{first-two-hash-chars}/{full-sha256}
```

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
```

Using alternate ports is valid because the same coordinator and node code paths are exercised.

## Fast manual setup

Create a temporary working folder outside the repo checkout.

```bash
mkdir -p /mnt/data/mcdn-fresh/coordinator/src
mkdir -p /mnt/data/mcdn-fresh/node-agent/src
mkdir -p /mnt/data/mcdn-fresh/demo-assets
```

Copy the current repository files into the test folder:

```text
modules/micro-cdn/coordinator/src/index.js
modules/micro-cdn/node-agent/src/index.js
modules/micro-cdn/demo-assets/hello.txt
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

## Run the test from a third terminal

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

## Known timing detail

The node manifest hit count updates after the file stream finishes.

If a test checks the manifest immediately after downloading, the hit count may appear unchanged for a moment.

Use a short wait before validating hits:

```bash
sleep 1
```

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

## Current tested values

```text
contentId: demo/hello.txt
publicPath: /mcdn/demo/hello.txt
sha256: 6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7
node: node-001
coordinator test port: 18080
node test port: 18081
```
