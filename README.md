# Open Edge Router

Open Edge Router is a resilient edge delivery architecture inspired by modern CDN and edge worker patterns. It routes content across multiple CDN providers, origin storage, and optional peer assisted delivery so that no single edge provider becomes a hard dependency.

This project is not a replacement for Cloudflare, Fastly, Akamai, or CloudFront. It is a provider neutral control layer and reference implementation for building a parallel edge network with failover, health checks, signed content paths, immutable chunk delivery, and optional censorship resistant access paths.

## Core Idea

Most websites depend on one edge provider for DNS, TLS, WAF, caching, routing, and DDoS protection. That creates a single operational and policy failure point.

Open Edge Router separates those functions.

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
