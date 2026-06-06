<p align="center">
  <a href="#node-registration" title="Read node registration"><img src="https://img.shields.io/badge/node-registration-2ea44f" alt="node registration"></a><br>
  <a href="#approved-content-registration" title="Read approved content registration"><img src="https://img.shields.io/badge/approval-manifest-0969da" alt="approval manifest"></a><br>
  <a href="#deadline-based-routing-response" title="Read deadline based routing"><img src="https://img.shields.io/badge/routing-deadline-6f42c1" alt="deadline routing"></a><br>
  <a href="#route-reason-codes" title="Read route reason codes"><img src="https://img.shields.io/badge/reason-codes-f97316" alt="reason codes"></a><br>
  <a href="#initial-implementation-constraints" title="Read implementation constraints"><img src="https://img.shields.io/badge/v1-constrained-d73a49" alt="v1 constrained"></a>
</p>

# Micro CDN Protocol Draft

> [!NOTE]
> This protocol draft favors boring local development first. It is intentionally constrained so the module can be tested before adding distributed trust or production routing.

The micro CDN treats community nodes as untrusted transports. A node can move bytes, but it does not become a source of truth. The coordinator only routes approved public content, and clients or fetch layers must still verify the returned bytes against the expected hash.

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

The coordinator accepts approved public content through:

```text
POST /content/approve
```

The request body is a signable approval manifest shape. The current runtime stores the structure and validates the policy fields. Future work can replace the verification stub with real detached signature verification.

```json
{
  "approvalId": "appr_demo_hello_0001",
  "issuer": "local-coordinator",
  "contentId": "demo/hello.txt",
  "namespace": "demo",
  "displayPath": "hello.txt",
  "publicPath": "/mcdn/demo/hello.txt",
  "sha256": "6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7",
  "url": "https://origin.example.test/hello.txt",
  "originUrl": "https://origin.example.test/hello.txt",
  "contentType": "text/plain",
  "sizeBytes": 13,
  "maxAgeSeconds": 86400,
  "signatureAlgorithm": "none"
}
```

Successful approval returns the stored approval object and top level reason codes:

```json
{
  "ok": true,
  "content": {
    "approvalId": "appr_demo_hello_0001",
    "issuer": "local-coordinator",
    "contentId": "demo/hello.txt",
    "namespace": "demo",
    "displayPath": "hello.txt",
    "publicPath": "/mcdn/demo/hello.txt",
    "sha256": "6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7",
    "originUrl": "https://origin.example.test/hello.txt",
    "contentType": "text/plain",
    "sizeBytes": 13,
    "signatureAlgorithm": "none"
  },
  "reasonCodes": [
    "CONTENT_APPROVED",
    "APPROVAL_NOT_EXPIRED",
    "HASH_AVAILABLE"
  ]
}
```

> [!IMPORTANT]
> The display path is human readable, but the content hash is the integrity source of truth.

### Approval validation

The coordinator rejects malformed approval records before storing them.

Rejected approval records return HTTP `400` with reason codes such as:

```text
CONTENT_NOT_APPROVED
APPROVAL_EXPIRED
INVALID_NAMESPACE
INVALID_PUBLIC_PATH
INVALID_SHA256
INVALID_ORIGIN_URL
INVALID_SIZE
INVALID_CONTENT_TYPE
INVALID_CREATED_AT
INVALID_EXPIRES_AT
```

Current runtime validation includes:

```text
namespace must match lowercase DNS safe label style
publicPath must start with /mcdn/ and must not contain traversal
sha256 must be lowercase 64 character hex
originUrl must be HTTP or HTTPS
contentType must look like a media type
expiresAt must be a future ISO timestamp when provided
sizeBytes must be a positive integer when provided
```

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
  "approvalId": "appr_demo_hello_0001",
  "issuer": "local-coordinator",
  "expiresAt": "2026-05-16T00:00:00.000Z",
  "namespace": "demo",
  "displayPath": "hello.txt",
  "publicPath": "/mcdn/demo/hello.txt",
  "sha256": "6abf984b2dbbd2235cc76d0231faab579115ece25039a8f84bf3d29fd147dae7",
  "sizeBytes": 13,
  "contentType": "text/plain",
  "routingMode": "hedged-deadline",
  "deadlineMs": 1200,
  "coordinatorBudgetMs": 50,
  "firstByteTimeoutMs": 250,
  "backupRaceAfterMs": 75,
  "selectedNode": {
    "nodeId": "node-001",
    "region": "local-dev",
    "downloadUrl": "http://127.0.0.1:8081/mcdn/demo/hello.txt",
    "reasonCodes": [
      "NODE_REGISTERED",
      "NODE_HEALTHY",
      "NODE_ENABLED",
      "NODE_ONLINE",
      "NODE_ADVERTISES_CONTENT",
      "NODE_WITHIN_DEADLINE",
      "NODE_SCORE_ACCEPTED"
    ]
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
      "firstByteAvgMs": 85,
      "reasonCodes": [
        "NODE_REGISTERED",
        "NODE_HEALTHY",
        "NODE_ENABLED",
        "NODE_ONLINE",
        "NODE_ADVERTISES_CONTENT",
        "NODE_WITHIN_DEADLINE",
        "NODE_SCORE_ACCEPTED"
      ]
    }
  ],
  "rejectedCandidates": [],
  "originFallback": {
    "enabled": true,
    "raceAfterMs": 300,
    "url": "https://origin.example.test/hello.txt"
  },
  "reasonCodes": [
    "CONTENT_APPROVED",
    "APPROVAL_NOT_EXPIRED",
    "HASH_AVAILABLE",
    "NODE_POOL_AVAILABLE",
    "LOWEST_SCORE",
    "ORIGIN_FALLBACK_AVAILABLE"
  ]
}
```

The legacy `selectedNode` field remains for compatibility. New clients should prefer `candidates` and race the backup before the primary fully times out.

> [!TIP]
> Deadline based routing lets a client preserve one total request budget while still trying backup nodes before the primary path fully fails.

## Route reason codes

Top level `/route` reason codes explain the route decision:

```text
CONTENT_APPROVED
APPROVAL_NOT_EXPIRED
HASH_AVAILABLE
NODE_POOL_AVAILABLE
LOWEST_SCORE
BACKUP_SELECTED
ORIGIN_FALLBACK_AVAILABLE
NO_HEALTHY_NODE
```

Candidate level reason codes explain why an individual node was eligible:

```text
NODE_REGISTERED
NODE_HEALTHY
NODE_ENABLED
NODE_ONLINE
NODE_ADVERTISES_CONTENT
NODE_WITHIN_DEADLINE
NODE_SCORE_ACCEPTED
```

Rejected candidate reason codes are returned when no healthy node is available or kept internally for diagnostics:

```text
NODE_STALE
NODE_DISABLED
NODE_OFFLINE
NODE_DOES_NOT_HAVE_CONTENT
NODE_SCORE_TOO_LOW
NODE_TIMEOUT_RATE_TOO_HIGH
NODE_ERROR_RATE_TOO_HIGH
NODE_OUTSIDE_POLICY
```

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

1. Reject missing approval records.
2. Reject expired approval records.
3. Remove stale nodes.
4. Remove disabled or offline nodes.
5. Score remaining nodes by first byte timing, timeout rate, error rate, success rate, and cache use.
6. Return the primary node plus backups as candidates.
7. Let clients race backup nodes inside one total request deadline.
8. Keep origin fallback as the escape hatch.

## Initial implementation constraints

1. HTTP only for local node development.
2. HTTP or HTTPS required for approved origin URLs.
3. Public static files only.
4. Hash verification required.
5. Approval records are signable, but full public key infrastructure is not implemented yet.
6. No peer to peer mesh routing in v1.
7. Coordinator remains centralized initially.
8. No encrypted overlay network in v1.

> [!WARNING]
> The v1 coordinator is intentionally centralized. Do not describe it as a production distributed trust system until that work exists.
