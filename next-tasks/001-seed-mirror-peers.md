# Next task: use static seed mirrors as peer bootstrap sources

## Idea

GitHub Pages should not be treated as a true live peer because it cannot run peer negotiation, accept dynamic uploads, maintain health state, or participate in WebRTC. It can still be useful as a static seed mirror for approved public content.

The practical model is:

```text
Flareless runtime
  |
  | CDN A
  | CDN B
  | CDN C
  |
  | if all CDN routes fail
  |
  | peer mesh lookup
  | seed mirror lookup
        |
        GitHub Pages seed
        GitLab Pages seed
        static object bucket seed
        user hosted seed
```

## Goal

Add seed mirror support so a peer mesh can bootstrap from static public mirrors when no live peer already has the requested chunk.

## Why this matters

A new mesh has a cold start problem. If no peer has a chunk yet, the first peer needs a safe public source to fetch from. A static seed mirror solves that problem without requiring physical devices or a full peer network during early testing.

## Proposed implementation

1. Add `seedMirrors` to the MGP manifest.
2. Add GitHub Pages as the first example seed mirror.
3. Update the peer mesh simulator so a simulated peer can fetch from a seed mirror when no other peer has the chunk.
4. Verify SHA256 before accepting the seed chunk.
5. After verification, allow the peer to advertise that chunk to the local peer registry.
6. Add tests proving seed mirror fallback, hash rejection, and later peer reuse.

## Minimum safety gates

1. Seed mirrors only serve approved public paths.
2. No arbitrary proxying.
3. No private headers are sent to seed mirrors.
4. No private origin credentials are stored in seed mirror config.
5. Hash verification is required before a seeded chunk becomes mesh available.

## Test cases

1. No live peer has chunk, seed mirror has valid chunk, peer accepts it.
2. No live peer has chunk, seed mirror has bad hash, peer rejects it.
3. First peer seeds chunk, second request gets chunk from live peer instead of seed mirror.
4. Unknown path is rejected before seed mirror fetch.
5. Unsafe headers are not forwarded to seed mirrors.

## Definition of done

1. `seedMirrors` appears in generated manifests.
2. A GitHub Pages seed mirror example exists in docs or examples.
3. The peer mesh simulator can bootstrap a chunk from a seed mirror.
4. Tests pass for seed success, seed hash failure, and peer reuse after seeding.
