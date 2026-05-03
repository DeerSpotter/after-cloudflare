# Legal Content CDN Layering Guide

This guide explains how a legal streaming platform can use Open Edge Router's multi CDN and peer assisted delivery design.

The goal is not to bypass rights enforcement or distribute unauthorized media. The goal is to make licensed, public domain, creator owned, or internal video content resilient, fast, and cost efficient.

## What CDN Layering Means Here

Do not chain CDNs in series.

Bad design:

```text
User -> CDN A -> CDN B -> CDN C -> Origin
```

If CDN A fails, the entire chain fails.

Use parallel CDN routes instead.

Good design:

```text
User
  |---- CDN A
  |---- CDN B
  |---- CDN C
  |---- Peer assisted fallback
  |
Origin storage
```

## Legal Content Use Case

A legal streaming site can use this architecture for:

```text
licensed anime
public domain media
creator owned video
school or church video libraries
enterprise training videos
conference recordings
independent film libraries
```

## How The Site Would Use It

### 1. Encode Content Once

Create aligned video segments for each quality level.

```text
240p
480p
720p
1080p
```

Each segment should have:

```text
stable path
byte length
SHA256 hash
quality label
duration
version number
```

### 2. Upload To Origin Storage

Use one source of truth.

```text
S3
R2
Backblaze B2
Wasabi
MinIO
Azure Blob
Google Cloud Storage
```

Example path:

```text
/video/show1/ep1/v1/720p/seg_00001.m4s
```

### 3. Put Multiple CDNs In Front Of The Same Origin

Each CDN should serve the same object path.

```text
https://cdn-a.example.com/video/show1/ep1/v1/720p/seg_00001.m4s
https://cdn-b.example.com/video/show1/ep1/v1/720p/seg_00001.m4s
https://cdn-c.example.com/video/show1/ep1/v1/720p/seg_00001.m4s
```

### 4. Generate An MGP Manifest

The manifest tells the player every legal source for the segment.

```json
{
  "chunkId": "show1-ep1-720p-seg-00001",
  "quality": "720p",
  "startSeconds": 0,
  "endSeconds": 4,
  "durationSeconds": 4,
  "byteLength": 1048576,
  "sha256Hex": "expected-full-segment-hash",
  "cdnUrls": [
    "https://cdn-a.example.com/video/show1/ep1/v1/720p/seg_00001.m4s",
    "https://cdn-b.example.com/video/show1/ep1/v1/720p/seg_00001.m4s",
    "https://cdn-c.example.com/video/show1/ep1/v1/720p/seg_00001.m4s"
  ]
}
```

### 5. Let The Edge Router Select Providers

Open Edge Router already has the basic runtime behavior:

```text
rank CDN providers
try provider route
mark success or failure
skip blocked or unhealthy responses
fall back to peer response when every provider fails
```

### 6. Let The Player Blend CDN And Peers

The browser player should use CDNs for startup and recovery.

```text
low buffer -> CDN first
healthy buffer -> peer assisted delivery
CDN failure -> peer fallback
peer failure -> CDN recovery
```

### 7. Protect Rights And Access

Legal content still needs access control.

Use:

```text
signed manifests
short lived playback tokens
asset scoped tokens
region scoped rights rules
hash verification for every peer segment
rate limits on peer lookup and signaling
```

## What We Already Built In This Project

The project already contains these pieces:

```text
multi CDN provider selection
provider health memory
blocked response detection
MGP manifest endpoint
peer fallback response
WebRTC signaling
room partitioning
range based chunk protocol
multi peer parallel chunking
adaptive peer scheduler
service worker caching
MediaSource playback
ABR logic
PWA manifest
```

## What Still Needs Real Deployment Infrastructure

These pieces must be configured outside the repo:

```text
real CDN provider hostnames
origin storage bucket
encoded video ladder
signed manifest generator
TURN servers
metrics backend
token service
rate limiting policy
production domain and TLS
```

## Practical Launch Setup

```text
1. Encode one legal test video
2. Upload it to origin storage
3. Configure CDN A, CDN B, and CDN C over the same origin
4. Generate an MGP manifest with all CDN URLs
5. Deploy Open Edge Router Worker
6. Deploy TURN server
7. Open the demo player
8. Confirm CDN A playback
9. Block CDN A and confirm CDN B or CDN C playback
10. Open a second browser and confirm peer assisted segment transfer
11. Confirm SHA256 verification
12. Confirm fallback to CDN when peers fail
```

## Summary

For a legal content site, CDN layering means provider independence, performance, and uptime. The platform remains lawful because only authorized manifests, authorized CDN URLs, and hash verified segments are distributed.

Open Edge Router already implements the core layering logic. Production deployment requires real provider configuration, legal content, token enforcement, TURN, and monitoring.
