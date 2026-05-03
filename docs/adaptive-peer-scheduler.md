# Adaptive Peer Scheduler

The adaptive peer scheduler is the piece that turns the peer layer from simple fallback into a swarm style delivery system.

## Goal

The scheduler decides which peers should receive byte range requests for a segment. It avoids slow peers, cools down failing peers, punishes invalid data, and dynamically adjusts range size based on observed throughput.

## Data Flow

```text
segment request
  |
CDN attempt
  |
peer fallback or hybrid mode
  |
adaptive scheduler ranks peers
  |
parallel range requests
  |
range hash verification
  |
full segment hash verification
  |
append to playback buffer
```

## Peer Signals

Each peer tracks:

```text
successes
failures
invalid ranges
bytes transferred
in flight range count
average latency
average throughput
cooldown window
```

## Scheduling Logic

Higher score peers receive work first.

A good peer has:

```text
high success count
high throughput
low latency
few or no failures
no invalid ranges
low in flight count
```

A bad peer has:

```text
timeouts
hash failures
high latency
too many in flight transfers
```

## Congestion Control

The scheduler limits concurrent work per peer. This prevents one browser from overwhelming another browser during upload.

Default behavior:

```text
max in flight per peer: 2
max peers per chunk: 8
range size: adaptive
```

## Range Size Control

The scheduler starts with a safe range size and adjusts based on measured throughput.

Typical range sizes:

```text
64 KB minimum
256 KB default
512 KB maximum
```

Small ranges improve recovery from bad peers. Large ranges reduce overhead when peers are fast.

## Upload Limiter

Each peer also has a local upload limiter.

This protects the user device from becoming overloaded while watching video.

Default behavior:

```text
max concurrent uploads: 4
max queued uploads: 32
```

## Required Manifest Fields

Parallel peer fetching needs byte length and hash data.

Each segment should include:

```json
{
  "chunkId": "episode-1-720p-seg-0001",
  "byteLength": 1048576,
  "sha256Hex": "expected-full-segment-hash",
  "durationSeconds": 4,
  "cdnUrls": [
    "https://cdn-a.example.com/video/ep1/720p/seg-0001.m4s",
    "https://cdn-b.example.com/video/ep1/720p/seg-0001.m4s"
  ]
}
```

Without byteLength, the system falls back to whole chunk peer requests.

## Production Requirements Still Needed

### TURN

WebRTC will fail for many users without TURN.

Production needs:

```text
STUN for discovery
TURN for relay fallback
regional TURN pools
bandwidth limits
```

### Persistent Metrics

Current browser metrics are local. Production needs aggregated telemetry.

Recommended metrics:

```text
peer success rate
peer invalid data rate
range timeout rate
average throughput per region
CDN fallback rate
buffer underrun rate
```

### Abuse Controls

Production needs identity and rate controls.

Minimum controls:

```text
signed manifests
short lived access tokens
per peer upload caps
tracker rate limits
room join limits
invalid data bans
```

### Encoding Pipeline

For streaming, all quality levels must have aligned segment boundaries.

Recommended ladder:

```text
240p
480p
720p
1080p
```

Each segment must have:

```text
same duration window
known byte length
full SHA256 hash
versioned URL path
```

## Current State

The repo now has:

```text
multi CDN routing
MGP routing protocol
peer tracker
distributed room signaling
WebRTC chunk protocol
parallel byte range chunking
adaptive peer scheduler
upload limiter
MediaSource playback
ABR logic
```

This is a complete architecture scaffold. Production readiness depends on operational infrastructure, especially TURN, monitoring, token security, and encoding automation.
