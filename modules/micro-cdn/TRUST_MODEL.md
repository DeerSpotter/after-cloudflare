# Micro CDN trust model

Flareless does not trust community operated nodes by default.

The micro CDN module should treat every peer, mirror, fork, and volunteer node as an untrusted transport until the requested public asset is proven to match an approved content record.

This document defines the first contract for Issue #14: auditable approvals, bounded routing, route reason codes, and rejection reason codes.

## Design stance

The micro CDN is an optional delivery route, not the whole identity of Flareless.

The safe operating model is:

1. The coordinator approves public content only.
2. The approval record describes exactly what may be served.
3. Nodes advertise only approved content identities.
4. The route response explains why each candidate was eligible.
5. The client or fetch layer verifies the returned bytes against the expected hash.
6. Origin fallback remains available when policy allows it.

## Non negotiable boundaries

The micro CDN must not become:

- an arbitrary proxy
- an exit node
- a private traffic relay
- a way to inspect browser cookies or authorization headers
- a cache for private origin content
- a substitute for content authorization

## Approval manifest

A content approval record is the coordinator side statement that a public asset is allowed to enter the micro CDN path.

Required fields:

| Field | Purpose |
| --- | --- |
| `approvalId` | Stable unique identifier for the approval event. |
| `issuer` | System, maintainer, or authority that issued the approval. |
| `createdAt` | ISO 8601 timestamp when approval was created. |
| `expiresAt` | ISO 8601 timestamp after which content must not route. |
| `namespace` | Public namespace for the content family. |
| `publicPath` | Public path exposed through `/mcdn/{namespace}/{displayPath}`. |
| `sha256` | Expected SHA256 digest of the bytes. |
| `sizeBytes` | Expected content size. |
| `contentType` | Declared media type. |
| `originUrl` | Public origin URL used as the authoritative source. |
| `signature` | Optional placeholder for a future detached signature. |
| `signatureAlgorithm` | Optional signature algorithm label. |

The initial implementation may use a verification stub, but the data model should already be shaped so real signature verification can replace the stub later.

## Approval validation rules

Reject approval records when any of these are true:

| Rejection code | Meaning |
| --- | --- |
| `CONTENT_NOT_APPROVED` | No matching approval record exists. |
| `APPROVAL_EXPIRED` | `expiresAt` is in the past. |
| `INVALID_NAMESPACE` | Namespace contains unsafe characters or empty segments. |
| `INVALID_PUBLIC_PATH` | Path is empty, absolute, contains traversal, or contains unsafe characters. |
| `INVALID_SHA256` | Digest is not a lowercase 64 character hex SHA256 value. |
| `INVALID_ORIGIN_URL` | Origin is missing, non HTTP/S, malformed, or private by policy. |
| `INVALID_SIZE` | Size is missing, negative, zero when not allowed, or not an integer. |
| `INVALID_CONTENT_TYPE` | Content type is missing or not allowed by policy. |

## Route reason codes

The `/route` response should include top level reason codes explaining the route decision.

Suggested top level codes:

```text
CONTENT_APPROVED
APPROVAL_NOT_EXPIRED
HASH_AVAILABLE
PRIMARY_CDN_FAILED
PRIMARY_CDN_DEGRADED
NODE_POOL_AVAILABLE
LOWEST_SCORE
BACKUP_SELECTED
ORIGIN_FALLBACK_AVAILABLE
NO_HEALTHY_NODE
```

## Candidate reason codes

Each returned candidate should include candidate level reason codes.

Suggested candidate codes:

```text
NODE_REGISTERED
NODE_HEALTHY
NODE_ENABLED
NODE_ONLINE
NODE_ADVERTISES_CONTENT
NODE_WITHIN_DEADLINE
NODE_SCORE_ACCEPTED
CACHE_HIT_REPORTED
```

## Internal rejection reason codes

Nodes removed from the candidate set should be rejected with explicit internal reasons.

Suggested node rejection codes:

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

These do not all need to be exposed publicly. Some are operational diagnostics. The route response should expose enough to explain behavior without leaking credentials, private configuration, or internal provider secrets.

## Minimum route response shape

```json
{
  "requestId": "route_01J00000000000000000000000",
  "namespace": "demo",
  "publicPath": "video/intro-0001.ts",
  "content": {
    "approvalId": "appr_01J00000000000000000000000",
    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "sizeBytes": 1048576,
    "contentType": "video/mp2t"
  },
  "selected": {
    "type": "micro-cdn-node",
    "nodeId": "node-local-1",
    "url": "http://127.0.0.1:8789/mcdn/demo/video/intro-0001.ts",
    "score": 0.91,
    "reasonCodes": [
      "NODE_REGISTERED",
      "NODE_HEALTHY",
      "NODE_ENABLED",
      "NODE_ONLINE",
      "NODE_ADVERTISES_CONTENT",
      "NODE_WITHIN_DEADLINE"
    ]
  },
  "backupCandidates": [],
  "originFallback": {
    "available": true,
    "url": "https://origin.example.test/video/intro-0001.ts"
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

## Implementation order

1. Add structured approval objects.
2. Validate approval inputs before storing them.
3. Reject expired approvals from route selection.
4. Add top level route reason codes.
5. Add candidate reason codes.
6. Track internal candidate rejection reasons.
7. Add tests for valid approval, expired approval, malformed approval, disabled node rejection, offline node rejection, and route explanation output.
8. Replace the verification stub with real signature verification later.

## Why this matters

Peer and community operated delivery only works when every cached byte and every routing decision can be explained.

The goal is not to trust volunteers more. The goal is to make trust unnecessary for the bytes that matter.