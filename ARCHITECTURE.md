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
4. Fetches through the highest ranked provider.
5. Marks success or failure.
6. Falls through to the next provider on blocked or failed responses.
7. Emits a peer fallback response if no provider succeeds.

## Provider selection

Current path: `src/routing/selector.js`

Provider scoring currently considers:

* Priority
* Cost weight
* Failure count
* Latency
* Block timeout
* Success history

Lower scores are preferred. The selected route should eventually include explicit reason codes so operators can explain why a route was chosen.

## Health model

Current path: `src/routing/health.js`

Health is currently in memory and tracks:

* Successes
* Failures
* Last latency
* Average latency
* Block timeout
* Last error

Future work should add persistent windows, distributed probe data, region awareness, and provider specific block detection.

## Provider adapter

Current path: `src/routing/providerFetch.js`

The provider adapter rewrites the incoming request to the selected provider base URL and forwards method, headers, path, and query string.

Future work should add:

* Request timeouts
* Retry budgets
* Header allow lists
* Provider specific auth
* Circuit breakers
* Structured provider errors

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
