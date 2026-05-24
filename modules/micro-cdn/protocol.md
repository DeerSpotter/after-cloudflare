<p align="center">
  <a href="#node-registration" title="Read node registration"><img src="https://img.shields.io/badge/node-registration-2ea44f" alt="node registration"></a><br>
  <a href="#deadline-based-routing-response" title="Read deadline based routing"><img src="https://img.shields.io/badge/routing-deadline-6f42c1" alt="deadline routing"></a><br>
  <a href="#public-content-path" title="Read public content path"><img src="https://img.shields.io/badge/path-public-f9c513" alt="public path"></a><br>
  <a href="#initial-implementation-constraints" title="Read implementation constraints"><img src="https://img.shields.io/badge/v1-constrained-d73a49" alt="v1 constrained"></a>
</p>

# Micro CDN Protocol Draft

> [!NOTE]
> This protocol draft favors boring local development first. It is intentionally constrained so the module can be tested before adding distributed trust or production routing.

## Node registration

A node registers with the coordinator using:

```json
{
  "nodeId": "node-001",
  "region": "us-east",
  "maxDiskMb": 1024,
  "maxBandwidthMbps": 25,
  "microCdnEnabled": true,
  "publicAddress": "http://127.0.0.1:8081"
}
```

## Health report

Nodes report basic state and may also report timing statistics collected by clients or gateway code.

```json
{
  "nodeId": "node-001",
  "online": true,
  "cacheHits": 42,
  "bytesServed": 10485760,
  "cachedFiles": 3,
  "uptimeSeconds": 3600,
  "requestCount": 100,
  "successCount": 96,
  "timeoutCount": 3,
  "errorCount": 1,
  "firstByteAvgMs": 85,
  "firstByteP95Ms": 190
}
```

## Per request result report

A client, gateway, or node can report the result of a request so the coordinator can improve future routing decisions.

```json
{
  "nodeId": "node-001",
  "success": true,
  "timeout": false,
  "firstByteMs": 92
}
```

Endpoint:

```text
POST /nodes/report
```

## Approved content registration

```json
{
  "contentId": "demo/hello.txt",
  "namespace": "demo",
  "displayPath": "hello.txt",
  "publicPath": "/mcdn/demo/hello.txt",
  "sha256": "hash_here",
  "url": "https://example.org/file.zip",
  "originUrl": "https://example.org/file.zip",
  "contentType": "application/octet-stream",
  "sizeBytes": 123456,
  "maxAgeSeconds": 86400
}
```

> [!IMPORTANT]
> The display path is human readable, but the content hash is the integrity source of truth.

## Public content path

Public micro CDN content uses this shape:

```text
/mcdn/{namespace}/{displayPath}
```

Example:

```text
/mcdn/demo/hello.txt
```

The public path is a stable alias. The content hash is the integrity source of truth.

## Deadline based routing response

The coordinator returns a routing plan, not just a single timeout target.

```json
{
  "contentId": "demo/hello.txt",
  "namespace": "demo",
  "displayPath": "hello.txt",
  "publicPath": "/mcdn/demo/hello.txt",
  "sha256": "hash_here",
  "routingMode": "hedged-deadline",
  "deadlineMs": 1200,
  "coordinatorBudgetMs": 50,
  "firstByteTimeoutMs": 250,
  "backupRaceAfterMs": 75,
  "selectedNode": {
    "nodeId": "node-001",
    "region": "local-dev",
    "downloadUrl": "http://127.0.0.1:8081/mcdn/demo/hello.txt"
  },
  "candidates": [
    {
      "role": "primary",
      "nodeId": "node-001",
      "region": "local-dev",
      "downloadUrl": "http://127.0.0.1:8081/mcdn/demo/hello.txt",
      "firstByteTimeoutMs": 250,
      "raceAfterMs": 0,
      "score": 150,
      "successRate": 1,
      "timeoutRate": 0,
      "firstByteP95Ms": 190,
      "firstByteAvgMs": 85
    },
    {
      "role": "backup",
      "nodeId": "node-002",
      "region": "local-dev",
      "downloadUrl": "http://127.0.0.1:8082/mcdn/demo/hello.txt",
      "firstByteTimeoutMs": 250,
      "raceAfterMs": 75,
      "score": 240,
      "successRate": 0.98,
      "timeoutRate": 0.02,
      "firstByteP95Ms": 260,
      "firstByteAvgMs": 110
    }
  ],
  "originFallback": {
    "enabled": true,
    "raceAfterMs": 300,
    "url": "https://example.org/file.zip"
  }
}
```

The legacy `selectedNode` field remains for compatibility. New clients should prefer `candidates` and race the backup before the primary fully times out.

> [!TIP]
> Deadline based routing lets a client preserve one total request budget while still trying backup nodes before the primary path fully fails.

## Routing query options

```text
GET /route?path=/mcdn/demo/hello.txt
GET /route?path=/mcdn/demo/hello.txt&deadlineMs=1200&candidateLimit=3
GET /route?contentId=demo/hello.txt&firstByteTimeoutMs=250&backupRaceAfterMs=75
```

Supported options:

```text
deadlineMs
coordinatorBudgetMs
firstByteTimeoutMs
backupRaceAfterMs
originRaceAfterMs
candidateLimit
mode
```

## Routing model

1. Remove stale nodes
2. Remove disabled or offline nodes
3. Score remaining nodes by first byte timing, timeout rate, error rate, success rate, and cache use
4. Return the primary node plus backups as candidates
5. Let clients race backup nodes inside one total request deadline
6. Keep origin fallback as the escape hatch

## Initial implementation constraints

1. HTTP only for local development
2. Public static files only
3. Hash verification required
4. No peer to peer mesh routing in v1
5. Coordinator remains centralized initially
6. No encrypted overlay network in v1

> [!WARNING]
> The v1 coordinator is intentionally centralized. Do not describe it as a production distributed trust system until that work exists.
