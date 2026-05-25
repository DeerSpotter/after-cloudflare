<p align="center">
  <a href="#runtime-path" title="Read the runtime path"><img src="https://img.shields.io/badge/runtime-router-2ea44f" alt="runtime router"></a><br>
  <a href="#provider-selection" title="Read provider selection"><img src="https://img.shields.io/badge/providers-ranked-6f42c1" alt="providers ranked"></a><br>
  <a href="#agent-assisted-cdn-control" title="Read agent assisted CDN control"><img src="https://img.shields.io/badge/agent-CDN%20control-0969da" alt="agent CDN control"></a><br>
  <a href="./docs/failure-point-tracking.md" title="Read the standalone failure point tracking guide"><img src="https://img.shields.io/badge/failure-points-d73a49" alt="failure points"></a><br>
  <a href="#peer-assisted-fallback" title="Read peer assisted fallback"><img src="https://img.shields.io/badge/peer-fallback-f9c513" alt="peer fallback"></a><br>
  <a href="#security-boundaries" title="Read security boundaries"><img src="https://img.shields.io/badge/security-boundaries-d73a49" alt="security boundaries"></a>
</p>

# Architecture

Flareless is a provider neutral edge runtime and routing system. It separates traffic control from any single CDN so requests can route around outages, blocking, policy failures, rate limits, and degraded network paths.

> [!IMPORTANT]
> Flareless should keep routing decisions explainable. Provider choice, peer fallback, origin fallback, failure points, and agent recommendations should be visible through reason codes, headers, endpoints, or documented policy.

## System overview

```text
Client
  |
Flareless runtime
  |
  |---- Provider adapter A
  |---- Provider adapter B
  |---- Provider adapter C
  |
Failure point tracking
  |
Agent assisted CDN control
  |
Peer assisted fallback
  |
Origin or object storage
```

The runtime receives an incoming request, ranks available providers, attempts each provider in order, records provider health, tracks failure points, and returns a peer fallback response when all provider routes fail.

## Runtime path

Current path: `src/worker.js`

The Worker runtime handles:

* `/health`
* `/manifest`
* `/peer/room-info`
* `/peer/ws`
* `/agent/cdn-control`
* Default routed asset requests

For normal asset requests, the runtime:

1. Reads provider configuration.
2. Reads the current health snapshot.
3. Ranks providers.
4. Fetches through the highest ranked provider with a provider specific timeout.
5. Records each provider attempt.
6. Tracks failure points for timeout, blocked status, fetch error, peer fallback, origin fallback, or policy blocked fallback.
7. Marks success or failure.
8. Falls through to the next provider on timeout, blocked status, or failed response.
9. Emits a peer fallback response if no provider succeeds.

Successful routed responses include explanation headers:

```text
x-flareless-provider: cdn-b
x-flareless-route-id: route-id
x-flareless-reason: PROVIDER_TIMEOUT_FAILOVER
x-flareless-attempts: cdn-a:PROVIDER_TIMEOUT,cdn-b:PROVIDER_SUCCESS
x-flareless-failure-points: 1:PROVIDER_TIMEOUT:cdn-a:PROVIDER_TIMEOUT
```

The legacy `x-open-edge-provider` and `x-mgp-route-id` headers are still emitted for compatibility with the earlier prototype.

## Provider selection

Current path: `src/routing/selector.js`

Provider scoring currently considers:

* Priority
* Cost weight
* Failure count
* Latency
* Block timeout
* Success history

Lower scores are preferred. Route explanation headers now describe whether the selected provider was used directly or reached after failover.

> [!NOTE]
> Provider ranking should prefer the best healthy route, not a favorite vendor. The design goal is provider neutral recovery.

## Health model

Current path: `src/routing/health.js`

Health is currently in memory and tracks:

* Successes
* Failures
* Last latency
* Average latency
* Block timeout
* Last error

Provider timeouts are recorded as provider failures. A provider that repeatedly fails or returns a blocked status is avoided for a cooldown window.

Future work should add persistent windows, distributed probe data, region awareness, and provider specific block detection.

## Avoiding a New Single Point of Failure

Flareless should not become one new shared failover switch. The routing layer is designed so health, policy, and fallback decisions can be scoped instead of being treated as one global truth.

Each request creates a route scope. The current runtime tracks both a route key and a chunk key, then combines health layers when ranking providers. This allows a failed provider path for one video route or one chunk to influence that exact path without automatically forcing unrelated assets, users, or routes onto the same fallback.

The current scoped health layers are:

```text
global health      low weight safety signal
route health       route specific failure signal
chunk health       exact asset or chunk failure signal
session health     optional user or group specific signal
```

This means a bad `cdn-a` response for one route should not poison every request. A video chunk can move to `cdn-b` while an unrelated asset still starts on `cdn-a`.

Route policy also stays scoped. A video route can allow peer fallback while blocking origin fallback. A private route can block both peer and origin fallback. An origin allowed route can skip peer fallback and use origin only as a controlled last resort.

The long term control plane should preserve this model. Distributed probes, regional scoring, and operator controls should feed scoped health buckets instead of creating one central decision point.

> [!WARNING]
> A failover system can accidentally become a new control plane dependency. Scoped health and scoped policy are the protection against that problem.

## Provider adapter

Current path: `src/routing/providerFetch.js`

The provider adapter rewrites the incoming request to the selected provider base URL and forwards method, headers, path, and query string.

The adapter returns a structured result instead of only a raw response. The result identifies whether the provider responded, timed out, or failed during fetch.

Current provider result reasons:

```text
PROVIDER_RESPONSE
PROVIDER_TIMEOUT
PROVIDER_FETCH_ERROR
```

Current route explanation reasons:

```text
PRIMARY_PROVIDER_SUCCESS
PROVIDER_TIMEOUT_FAILOVER
PROVIDER_BLOCKED_FAILOVER
PROVIDER_FAILOVER_SUCCESS
```

Future work should add:

* Retry budgets
* Header allow lists
* Provider specific auth
* Circuit breakers
* More detailed structured provider errors

## Agent assisted CDN control

Current path: `src/agent/cdnControl.js`

Current endpoint:

```text
/agent/cdn-control
```

The agent assisted CDN control layer is observe and recommend. It does not replace the fast routing path, does not silently change route policy, and does not bypass origin or peer safety rules.

The agent receives provider attempts, failure points, route policy, and route scope, then returns:

* Provider failure summary
* Failure point chain summary
* Timeout, block, fetch error, and failure point notices
* Scoped recommendation
* Proposed policy annotation
* Cooldown provider list
* Whether peer fallback or origin fallback should remain allowed

Example query:

```text
/agent/cdn-control?attempts=cdn-a:PROVIDER_TIMEOUT,cdn-b:PROVIDER_BLOCKED_429,cdn-c:PROVIDER_SUCCESS
```

Expected recommendation shape:

```text
COOLDOWN_FAILED_PROVIDERS_KEEP_PEER_FALLBACK
```

> [!IMPORTANT]
> The agent recommends bounded policy changes for review. It should not become an automatic control plane that globally reroutes unrelated assets or users.

## Failure point tracking

Standalone guide:

```text
./docs/failure-point-tracking.md
```

Current path: `src/agent/failurePointTracker.js`

Failure point tracking records where the route broke, not just which provider returned a failure. A failure point includes:

* Sequence number
* Failure stage
* Failure code
* Provider when applicable
* Route key
* Chunk key
* Policy ID
* Whether peer or origin fallback was allowed
* Detail fields such as response status or source

Current stages include:

```text
PROVIDER_TIMEOUT
PROVIDER_BLOCKED_STATUS
PROVIDER_FETCH_ERROR
PEER_FALLBACK_DECISION
ORIGIN_FALLBACK_DECISION
POLICY_BLOCKED_FALLBACK
```

Runtime responses expose a compact failure point chain through:

```text
x-flareless-failure-points
```

The agent report also includes the full `failurePoints` array and `failurePointSummary` object so the control layer can explain the first failure point, last failure point, stage counts, and provider counts.

> [!TIP]
> Failure point tracking is what lets the demo show what the agent noticed before suggesting a bounded route policy change.

## Manifest model

Current path: `src/mgp/protocol.js`

The manifest currently describes an asset path and available provider URLs.

Future manifest work should add:

* JSON schema
* Chunk hashes
* Signature verification
* Key rotation
* Versioned immutable paths
* Expiration and replay protection

## Peer assisted fallback

Current paths:

* `src/peer/`
* `public/mgpAdaptivePeerScheduler.js`
* `scripts/simulate-network.mjs`

Peers are untrusted. Peer delivery must be treated as a fallback path for immutable, hash verified chunks. A peer should never become trusted just because it responded quickly.

The peer scheduler currently tracks:

* Peer successes
* Failures
* Invalid ranges
* Bytes transferred
* In flight ranges
* Latency
* Throughput
* Cooldown windows

Future work should add WebRTC transport, hash validation, peer trust penalties, and abuse controls.

> [!CAUTION]
> Peer speed is useful only after integrity is proven. Fast invalid content should be rejected and penalized.

## Control plane services

Current path: `services/`

The Go services are the future control plane. They should eventually provide distributed health checks, route scoring APIs, observability, and operator controls.

Current services are scaffolds. The JavaScript runtime is the more complete prototype today.

## Failure philosophy

The system assumes every external route can fail.

Expected failure cases include:

* Provider outage
* DNS failure
* TLS failure
* HTTP block response
* Rate limit response
* Region specific degradation
* Provider timeout
* Peer timeout
* Invalid peer chunk
* Origin access failure

A good route decision should be fast, explainable, reversible, and safe.

## Security boundaries

Do not trust providers blindly.

Do not trust peers at all.

Do not expose private origin credentials.

Do not share private keys with peers.

Do not treat unsigned peer content as valid.

Do not build hidden provider lock in.

## Contribution boundaries

Safe areas for early contributors:

* Tests
* Documentation
* Provider config examples
* Manifest schema
* Route scoring improvements
* Local simulation scenarios
* Health check structure
* Agent assisted CDN control recommendations
* Failure point tracking

Areas that need extra review:

* Signing and verification
* Peer trust decisions
* WebRTC signaling
* Origin access controls
* Abuse prevention
* Provider auth logic
* Automatic policy mutation
