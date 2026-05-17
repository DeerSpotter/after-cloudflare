# Architecture

Flareless is a provider neutral edge runtime and routing system. It separates traffic control from any single CDN so requests can route around outages, blocking, policy failures, rate limits, and degraded network paths.

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
Peer assisted fallback
  |
Origin or object storage
```

The runtime receives an incoming request, ranks available providers, attempts each provider in order, records provider health, and returns a peer fallback response when all provider routes fail.

## Runtime path

Current path: `src/worker.js`

The Worker runtime handles:

* `/health`
* `/manifest`
* `/peer/room-info`
* `/peer/ws`
* Default routed asset requests

For normal asset requests, the runtime:

1. Reads provider configuration.
2. Reads the current health snapshot.
3. Ranks providers.
4. Fetches through the highest ranked provider with a provider specific timeout.
5. Records each provider attempt.
6. Marks success or failure.
7. Falls through to the next provider on timeout, blocked status, or failed response.
8. Emits a peer fallback response if no provider succeeds.

Successful routed responses include explanation headers:

```text
x-flareless-provider: cdn-b
x-flareless-route-id: route-id
x-flareless-reason: PROVIDER_TIMEOUT_FAILOVER
x-flareless-attempts: cdn-a:PROVIDER_TIMEOUT,cdn-b:PROVIDER_SUCCESS
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

Areas that need extra review:

* Signing and verification
* Peer trust decisions
* WebRTC signaling
* Origin access controls
* Abuse prevention
* Provider auth logic