# Optional Micro CDN Module

This module is an optional experiment for community operated edge delivery.

The core project does not require every node to cache or serve content. A node operator must explicitly enable this module before the node participates in file delivery.

## Purpose

The module allows approved public static files to be cached and served by volunteer nodes.

The first goal is intentionally small:

1. Run a node locally
2. Enable micro CDN mode
3. Register the node with a coordinator
4. Cache one approved static file
5. Retrieve that file from another machine
6. Report basic node health and cache hit metrics
7. Disable the module cleanly

## Non goals

1. No private traffic inspection
2. No anonymous exit node behavior
3. No arbitrary website proxying
4. No dynamic application proxying
5. No full DNS replacement
6. No TLS automation in the first version
7. No attempt to replace large CDN providers feature for feature

## Module layout

```text
modules/micro-cdn/
  README.md
  protocol.md
  node-agent/
    README.md
    config.example.json
    package.json
    src/
      index.js
      config.js
      cacheStore.js
      health.js
  coordinator/
    README.md
    package.json
    src/
      index.js
      registry.js
      contentMap.js
      router.js
```

## Basic architecture

```text
Approved content is registered with coordinator
    |
Node agent opts into micro CDN mode
    |
Node advertises disk, bandwidth, region, and health
    |
Coordinator maps content hash to healthy nodes
    |
Client asks coordinator where to download an asset
    |
Client downloads from selected node
    |
Node reports cache hit and bytes served
```

## Safety principles

1. Opt in only
2. Cache only approved public files
3. Respect node disk limits
4. Respect node bandwidth limits
5. Allow instant disable
6. Do not inspect user browsing traffic
7. Do not act as an exit node
8. Do not serve unapproved content
9. Prefer content hash verification
10. Keep the first implementation boring and auditable

## Suggested first demo

Use two local machines or two terminal windows.

1. Start the coordinator
2. Start one node agent
3. Register one approved static file
4. Fetch the file through the coordinator route
5. Confirm the node reports one cache hit

## Positioning

The crowd can become the edge, but only when users explicitly choose to participate.
