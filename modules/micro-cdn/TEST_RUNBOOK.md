# Micro CDN Test Runbook

## Purpose

This file exists so a future assistant or contributor can quickly reproduce the local micro CDN prototype test without rebuilding the process from scratch.

The current tested model uses:

```text
Coordinator identity: demo/hello.txt
Public CDN path: /mcdn/demo/hello.txt
Node storage path: cache/sha256/{first-two-hash-chars}/{full-sha256}
```

The coordinator now also enforces the approval trust model:

```text
approval manifest validation
expired approval rejection
HTTP or HTTPS origin URL requirement
route reason codes
candidate reason codes
internal rejected candidate reason codes
```

## Instructions for future AI assistants

When asked to test this module, do not rely on memory or prior chat context. Use this runbook as the source of truth for the local setup.

Recommended approach:

```text
1. Use a clean temporary test folder outside the repository checkout.
2. Copy only the needed micro CDN files into that folder.
3. Use alternate ports 18080 and 18081 unless the user specifically wants the default ports.
4. Start the coordinator before starting any node.
5. Start the normal node agent as the fast node.
6. Run invalid approval rejection first.
7. Run expired approval rejection second.
8. Run the basic lifecycle test third.
9. Run the restart persistence test fourth.
10. Run the delete and unadvertise test fifth.
11. Run the two node hedged failover scripts separately if transport behavior is being changed.
12. If a test fails, capture the exact command, response body, and log section before changing code.
13. Update TEST_RESULTS.md after any successful new test pass or after fixing a bug found by testing.
```

Use these process roles:

```text
coordinator: tracks approved content, nodes, mappings, route plans, quality scores, and approval records
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
npm run test:micro-cdn
scripts/smoke-test.ps1
scripts/delete-test.ps1
scripts/two-node-failover-test.ps1
scripts/hedged-fetch.mjs
scripts/slow-node-fixture.mjs
```

Only hand rebuild the test if the scripts are broken or if the environment cannot run PowerShell.

## What the integration test proves

The local test verifies that the prototype can:

```text
start coordinator
start node agent
register node
reject invalid local-demo origin approval
reject expired approval
approve public content path
cache local file
verify SHA256
store bytes by hash
advertise content
route by public path
return top level route reason codes
return selected node candidate reason codes
serve through /mcdn path
update manifest hits
persist coordinator state
persist node manifest
restart and recover
re advertise after restart
delete by public path
unadvertise after delete
fail route after no nodes remain
return NO_HEALTHY_NODE reason code after delete
```

## What the separate hedged failover scripts prove

The separate hedged failover scripts should still be used when route racing or transport timing changes:

```text
request deadline based route plan
return primary and backup candidates
race backup node after delay
verify fastest valid node wins
verify SHA256 after hedged fetch
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
```

Copy or reconstruct the following files into that folder:

```text
modules/micro-cdn/coordinator/src/index.js
modules/micro-cdn/node-agent/src/index.js
modules/micro-cdn/demo-assets/hello.txt
```

Start coordinator:

```bash
PORT=18080 DATA_DIR=/mnt/data/mcdn-fresh/coordinator/data node coordinator/src/index.js
```

Create node config:

```json
{
  "nodeId": "node-001",
  "region": "local-dev",
  "port": 18081,
  "coordinatorUrl": "http://127.0.0.1:18080",
  "publicAddress": "http://127.0.0.1:18081",
  "microCdnEnabled": true,
  "cacheDir": "/mnt/data/mcdn-fresh/node-agent/cache",
  "manifestFile": "/mnt/data/mcdn-fresh/node-agent/cache/manifest.json",
  "maxDiskMb": 128,
  "maxBandwidthMbps": 25,
  "heartbeatSeconds": 1
}
```

Start node:

```bash
CONFIG=/mnt/data/mcdn-fresh/node-agent/config.local.json node node-agent/src/index.js
```

Approve content with a valid HTTP or HTTPS origin URL:

```bash
curl -s -X POST http://127.0.0.1:18080/content/approve \
  -H 'content-type: application/json' \
  -d '{
    "contentId":"demo/hello.txt",
    "namespace":"demo",
    "displayPath":"hello.txt",
    "sha256":"6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7",
    "url":"https://origin.example.test/hello.txt",
    "originUrl":"https://origin.example.test/hello.txt",
    "contentType":"text/plain",
    "sizeBytes":13,
    "maxAgeSeconds":86400
  }'
```

Cache local file through the node:

```bash
curl -s -X POST http://127.0.0.1:18081/cache/local-file \
  -H 'content-type: application/json' \
  -d '{
    "contentId":"demo/hello.txt",
    "namespace":"demo",
    "displayPath":"hello.txt",
    "sourcePath":"/mnt/data/mcdn-fresh/demo-assets/hello.txt",
    "sha256":"6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7",
    "contentType":"text/plain"
  }'
```

Check route:

```bash
curl -s 'http://127.0.0.1:18080/route?path=%2Fmcdn%2Fdemo%2Fhello.txt'
```

Expected route response should include:

```text
CONTENT_APPROVED
APPROVAL_NOT_EXPIRED
HASH_AVAILABLE
NODE_POOL_AVAILABLE
ORIGIN_FALLBACK_AVAILABLE
NODE_ADVERTISES_CONTENT
```
