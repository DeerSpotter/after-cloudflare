<p align="center">
  <a href="#purpose" title="Read purpose"><img src="https://img.shields.io/badge/purpose-explain%20failure-d73a49" alt="explain failure"></a><br>
  <a href="#failure-point-shape" title="Read failure point shape"><img src="https://img.shields.io/badge/shape-route%20trace-6f42c1" alt="route trace"></a><br>
  <a href="#runtime-header" title="Read runtime header"><img src="https://img.shields.io/badge/header-x--flareless--failure--points-f9c513" alt="failure points header"></a><br>
  <a href="#agent-use" title="Read agent use"><img src="https://img.shields.io/badge/agent-observe%20recommend-2ea44f" alt="agent observe recommend"></a>
</p>

# Failure Point Tracking

Failure point tracking records where a route failed, not just which provider failed.

> [!IMPORTANT]
> This is one of the core credibility features in Flareless. It lets the runtime explain the failure chain before an agent or operator recommends a route policy change.

## Purpose

A normal failover system can tell you that a provider failed.

Flareless should tell you where the route broke:

```text
provider timeout
provider blocked status
provider fetch error
peer fallback selected
origin fallback selected
fallback blocked by policy
```

That difference matters because the next action should depend on the failure point.

Examples:

```text
Provider timeout          cool down provider and try next route
Provider 429              treat as provider block or rate limit
Peer fallback selected    verify peer rules and content integrity
Origin fallback selected  confirm policy allowed origin fallback
Policy blocked fallback   fail closed safely
```

## Current implementation

Current runtime module:

```text
src/agent/failurePointTracker.js
```

Current runtime integration:

```text
src/worker.js
```

Current tests:

```text
tests/failurePointTracker.test.mjs
tests/agentCdnControl.test.mjs
```

## Failure point shape

A failure point includes:

```text
sequence
stage
code
provider
routeKey
chunkKey
policyId
fallbackAllowed
detail
```

Example:

```json
{
  "sequence": 1,
  "stage": "PROVIDER_TIMEOUT",
  "code": "PROVIDER_TIMEOUT",
  "provider": "cdn-a",
  "routeKey": "route:/video/example/v1/chunk-0001.ts",
  "chunkKey": "chunk:/video/example/v1/chunk-0001.ts",
  "policyId": "video-public-peer-first",
  "fallbackAllowed": {
    "peer": true,
    "origin": false
  },
  "detail": {
    "source": "providerFetch"
  }
}
```

## Current failure stages

```text
PROVIDER_TIMEOUT
PROVIDER_BLOCKED_STATUS
PROVIDER_FETCH_ERROR
PEER_FALLBACK_DECISION
ORIGIN_FALLBACK_DECISION
POLICY_BLOCKED_FALLBACK
```

## Runtime header

Routed and fallback responses can expose a compact header:

```text
x-flareless-failure-points
```

Example:

```text
1:PROVIDER_TIMEOUT:cdn-a:PROVIDER_TIMEOUT,2:PROVIDER_BLOCKED_STATUS:cdn-b:PROVIDER_BLOCKED_429,3:PEER_FALLBACK_DECISION:PEER_FALLBACK_SELECTED
```

This header is intentionally compact. It is useful for debugging, demo animation, and route trace capture.

> [!NOTE]
> The compact header is not meant to replace the full failure point object. It is a quick transport and visibility signal.

## Agent use

The agent assisted CDN control report consumes failure points and produces:

```text
failurePoints
failurePointSummary
recommendation.failureStage
recommendation.failurePointCode
proposedPolicy.failureStage
proposedPolicy.failurePointCode
```

This lets the agent say what it noticed before suggesting a scoped action.

Good behavior:

```text
The agent noticed cdn-a timed out and cdn-b returned 429.
It recommends cooling down those providers and keeping peer fallback enabled for this route.
```

Bad behavior:

```text
The agent globally changes all routes because one provider failed once.
```

> [!WARNING]
> Failure point tracking should support scoped recommendations. It should not become a global automatic reroute trigger.

## Why this matters for the demo

The demo can show a visible failure chain:

```text
cdn-a timeout
cdn-b block response
peer fallback selected
agent recommendation appears
operator applies scoped suggestion
route behavior changes
```

That is much stronger than a generic failover demo because it shows what the agent actually noticed.

## Near term improvements

1. Add a route trace object that stores attempts and failure points together.
2. Allow `/agent/cdn-control` to consume a route trace instead of query parameters.
3. Add local integration tests that assert `x-flareless-failure-points` on real routed responses.
4. Add demo animation support for each failure point stage.
5. Add clear operator wording for each stage.

## Boundary

Failure point tracking is explanation infrastructure.

It is not a replacement for:

```text
signed manifests
hash verification
persistent control plane state
multi region health checks
operator approval workflow
```

It explains the failure chain so those systems can make better decisions later.
