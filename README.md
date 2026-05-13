# After Cloudflare

After Cloudflare is for the engineers who built the edge, kept it alive, carried the pager, solved the incidents, and then got told they were expendable.

This project gives that anger somewhere useful to go.

Not a rant. Not a boycott. Not a revenge repo.

A build.

An open source edge router and runtime for programmable request handling, multi CDN failover, provider neutral traffic control, and resilient internet delivery.

## Start Here

* `QUICKSTART.md` explains how to run the local runtime, tests, and simulator.
* `ROADMAP.md` breaks the project into contributor ready modules.
* `MILESTONES.md` defines the build phases and exit criteria.
* `ARCHITECTURE.md` explains request flow, provider selection, health, manifests, and peer fallback.
* `CONTRIBUTING.md` explains how to contribute without needing private context.
* `SECURITY.md` explains trust boundaries, peer rules, provider routing rules, and secret handling.
* `CODE_OF_CONDUCT.md` keeps the project sharp without letting it become personal.

## Core Idea

Most websites depend on one edge provider for DNS, TLS, WAF, caching, routing, and DDoS protection. That creates a single operational and policy failure point.

After Cloudflare separates those functions.

```text
User
  |
Smart Traffic Layer
  |
  |---- CDN A
  |---- CDN B
  |---- CDN C
  |---- Peer Assisted Edge
  |
Origin Storage
```

If one CDN fails, blocks traffic, rate limits the site, or becomes unreachable, traffic can route around it.

## Current Build

```text
src/          Worker runtime prototype
services/     Go control plane scaffold
public/       Browser side peer logic
scripts/      Local runner and simulation tools
tests/        Node test suite
```

Local checks:

```bash
npm install
npm test
go test ./...
go build ./...
```

Local runner:

```bash
npm run local
```

Simulator:

```bash
npm run simulate
```

## Design Goals

* Multi CDN routing
* Provider independent origin storage
* Health based failover
* Versioned immutable content paths
* Client side video chunk fallback
* Optional peer assisted delivery
* Optional onion access for emergency reachability
* No single CDN control point
* Cloudflare style edge worker language without Cloudflare dependency

## Recommended Architecture

```text
Registrar
  |
Independent DNS
  |
Traffic Director
  |
  |---- CDN Provider A
  |---- CDN Provider B
  |---- CDN Provider C
  |
Object Storage Origin
  |
Versioned Content
  |
Optional Peer Assisted Layer
  |
Optional Onion Bootstrap
```

## Why Parallel CDNs

CDNs should not be chained.

Bad:

```text
User -> CDN A -> CDN B -> CDN C -> Origin
```

If CDN A fails, everything fails.

Good:

```text
User
  |---- CDN A
  |---- CDN B
  |---- CDN C
  |---- Peer Fallback
```

Each route is independent.

## Example Content Path

```text
/video/show-name/episode-001/v17/720p/chunk-0001.ts
```

Use versioned paths instead of overwriting live files.

## Failover Logic

```text
Try primary CDN
If timeout, try secondary CDN
If HTTP 403, 404, 429, or 5xx, try next CDN
If all CDNs fail, try peer assisted layer
If peer layer fails, fall back to origin only if allowed
```

## Health Check Signals

Each CDN route should be checked from multiple regions.

```text
DNS success
TLS success
HTTP status
Time to first byte
Chunk download speed
Error rate
Provider specific block response
```

## Edge Routing Flow

```text
Incoming request
  |
Check route health table
  |
Select best healthy CDN
  |
Rewrite request to selected provider
  |
Return response or redirect
```

## Security Model

Assume every external node can fail or behave maliciously.

Required controls:

* Hash verified chunks
* Signed manifests
* Provider independent TLS
* Rate limits
* Abuse reporting process
* Clear content ownership
* Origin access restrictions
* No private key sharing with peers

## License

MIT
