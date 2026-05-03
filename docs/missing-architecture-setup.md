# Missing Architecture Setup Guide

This guide explains how to set up the external infrastructure that is required to turn Open Edge Router from a strong architecture scaffold into a deployable streaming system.

The repo already contains the browser and edge control pieces:

```text
multi CDN routing
MGP route protocol
provider health scoring
peer tracker
distributed room signaling
WebRTC peer connections
range based chunk protocol
multi peer parallel chunking
adaptive peer scheduler
upload limiter
MediaSource playback
ABR logic
```

The remaining work is operational infrastructure.

## 1. Required Production Architecture

```text
User browser
  |
Cloudflare Worker edge router
  |
  |---- CDN A
  |---- CDN B
  |---- CDN C
  |
Object storage origin

User browser
  |
WebSocket signaling Durable Object
  |
WebRTC peer mesh
  |
TURN relay fallback

Encoding pipeline
  |
versioned segments
  |
signed manifest
  |
CDN replication
```

## 2. TURN Server Setup

WebRTC needs STUN and TURN.

STUN helps peers discover their public network path. TURN relays traffic when direct peer to peer connectivity fails.

Without TURN, many users behind strict NAT or corporate firewalls will fail to connect.

### Recommended TURN software

Use coturn.

Ubuntu example:

```bash
sudo apt update
sudo apt install coturn
```

Enable coturn:

```bash
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

Create or edit:

```text
/etc/turnserver.conf
```

Example configuration:

```text
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
realm=turn.example.com
server-name=turn.example.com
user=openedge:change-this-password
no-multicast-peers
no-loopback-peers
stale-nonce=600
total-quota=1000
bps-capacity=0
no-cli
```

Start service:

```bash
sudo systemctl enable coturn
sudo systemctl restart coturn
sudo systemctl status coturn
```

Firewall ports:

```text
TCP 3478
UDP 3478
TCP 5349
UDP 5349
UDP relay range configured by coturn
```

For production, use multiple regional TURN servers:

```text
turn-us.example.com
turn-eu.example.com
turn-apac.example.com
```

Browser ICE config example:

```javascript
const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
            urls: "turn:turn.example.com:3478",
            username: "openedge",
            credential: "change-this-password"
        }
    ]
};
```

Production note: do not hardcode permanent TURN passwords in public JavaScript. Use short lived TURN credentials from a token service.

## 3. Short Lived TURN Credential Service

For production, generate temporary TURN credentials.

A common pattern is REST API token issuance:

```text
browser asks /api/turn-credentials
server validates session
server returns temporary username and credential
browser uses credentials for RTCPeerConnection
```

Response shape:

```json
{
  "iceServers": [
    {
      "urls": "stun:stun.l.google.com:19302"
    },
    {
      "urls": "turn:turn-us.example.com:3478",
      "username": "temporary-user",
      "credential": "temporary-password"
    }
  ],
  "expiresAt": 1770000000000
}
```

Minimum requirements:

```text
short expiration
rate limit by user or IP
bind credentials to region when possible
rotate TURN shared secret
never expose admin credentials
```

## 4. Encoding Pipeline

The streaming engine needs segmented video with aligned bitrates.

Use ffmpeg to create a multi bitrate ladder.

Example ladder:

```text
240p at 400 kbps
480p at 900 kbps
720p at 2500 kbps
1080p at 5000 kbps
```

All quality levels must use matching segment boundaries.

Example ffmpeg command for fragmented MP4 HLS:

```bash
ffmpeg -i input.mp4 \
  -filter_complex "[0:v]split=4[v1][v2][v3][v4];[v1]scale=-2:240[v1out];[v2]scale=-2:480[v2out];[v3]scale=-2:720[v3out];[v4]scale=-2:1080[v4out]" \
  -map "[v1out]" -map 0:a -c:v:0 h264 -b:v:0 400k -c:a:0 aac -b:a:0 96k \
  -map "[v2out]" -map 0:a -c:v:1 h264 -b:v:1 900k -c:a:1 aac -b:a:1 128k \
  -map "[v3out]" -map 0:a -c:v:2 h264 -b:v:2 2500k -c:a:2 aac -b:a:2 128k \
  -map "[v4out]" -map 0:a -c:v:3 h264 -b:v:3 5000k -c:a:3 aac -b:a:3 192k \
  -f hls \
  -hls_time 4 \
  -hls_playlist_type vod \
  -hls_segment_type fmp4 \
  -hls_flags independent_segments \
  -var_stream_map "v:0,a:0,name:240p v:1,a:1,name:480p v:2,a:2,name:720p v:3,a:3,name:1080p" \
  -master_pl_name master.m3u8 \
  -hls_segment_filename "out/%v/seg_%05d.m4s" \
  "out/%v/index.m3u8"
```

The project manifest must know each segment path, byte length, and SHA256 hash.

## 5. Manifest Generation

The MGP player should consume a manifest that includes:

```text
chunkId
quality level
start time
end time
duration
byte length
sha256 hash
CDN URLs
```

Example segment entry:

```json
{
  "chunkId": "show1-ep1-720p-seg-00001",
  "quality": "720p",
  "startSeconds": 4,
  "endSeconds": 8,
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

Suggested manifest generator flow:

```text
scan output segment folders
calculate byte length
calculate SHA256
build CDN URL list
write mgp-manifest.json
sign manifest
upload manifest and segments
```

Node example for hashing one file:

```javascript
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const bytes = await readFile("out/720p/seg_00001.m4s");
const sha256Hex = createHash("sha256").update(bytes).digest("hex");
const byteLength = bytes.byteLength;
```

## 6. Signed Manifest Service

The manifest must be trusted because peers are untrusted.

Minimum design:

```text
server generates manifest
server signs manifest body
browser verifies signature before playback
all peer chunks are checked against signed hashes
```

Recommended signing approaches:

```text
Ed25519 signature
HMAC for private deployments
JWS for web compatible token style signing
```

Do not trust:

```text
peer supplied hashes
CDN supplied hashes without signed manifest
unsigned metadata from browser storage
```

## 7. Object Storage Origin

Use one origin as the source of truth.

Recommended options:

```text
S3
Cloudflare R2
Backblaze B2
Wasabi
MinIO
Azure Blob
Google Cloud Storage
```

Path layout:

```text
/video/{show}/{episode}/v{version}/{quality}/seg_00001.m4s
/manifests/{show}/{episode}/v{version}/mgp-manifest.json
```

Use versioned paths. Do not overwrite active segments.

Good:

```text
/video/show1/ep1/v3/720p/seg_00001.m4s
```

Bad:

```text
/video/show1/ep1/720p/seg_00001.m4s
```

## 8. CDN Setup

Each CDN should pull from the same origin and serve the same path layout.

Example hostnames:

```text
cdn-a.example.com
cdn-b.example.com
cdn-c.example.com
```

Each segment should be reachable at equivalent paths:

```text
https://cdn-a.example.com/video/show1/ep1/v3/720p/seg_00001.m4s
https://cdn-b.example.com/video/show1/ep1/v3/720p/seg_00001.m4s
https://cdn-c.example.com/video/show1/ep1/v3/720p/seg_00001.m4s
```

CDN requirements:

```text
cache immutable segment paths
respect range requests where possible
serve CORS headers for browser playback
support TLS
avoid provider specific URL signing if possible
```

Suggested CORS headers:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Range, Content-Type
Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges
```

## 9. Worker Deployment

Install dependencies:

```bash
npm install
```

Login:

```bash
npx wrangler login
```

Deploy:

```bash
npx wrangler deploy
```

Durable Object binding must exist in wrangler.toml for signaling.

Example shape:

```toml
[[durable_objects.bindings]]
name = "SIGNALING_ROOM"
class_name = "MgpSignalingRoom"

[[migrations]]
tag = "v1"
new_classes = ["MgpSignalingRoom"]
```

Confirm routes:

```text
/health
/providers
/manifest
/peer/announce
/peer/lookup
/peer/ws
/peer/room-info
```

## 10. Token Service

Production should not allow anonymous unlimited usage.

Minimum token service responsibilities:

```text
issue playback token
issue manifest token
issue temporary TURN credentials
limit room joins
limit tracker announcements
rate limit peer lookup
bind token to asset where possible
```

Recommended token claims:

```json
{
  "sub": "user-or-session-id",
  "asset": "show1-ep1",
  "region": "us",
  "exp": 1770000000,
  "maxBitrate": 5000000
}
```

## 11. Metrics Backend

Browser local stats are not enough for production.

Collect:

```text
CDN hit rate
peer hit rate
range retry rate
peer invalid data rate
average peer throughput
TURN relay percentage
buffer underrun rate
ABR downgrade count
room size
signaling errors
```

Recommended backend options:

```text
Cloudflare Analytics Engine
Prometheus
ClickHouse
Grafana Loki
OpenTelemetry collector
custom ingestion endpoint
```

Basic ingestion route:

```text
POST /metrics/client
```

Example payload:

```json
{
  "asset": "show1-ep1",
  "region": "us",
  "quality": "720p",
  "cdnHits": 12,
  "peerHits": 31,
  "failedChunks": 1,
  "bufferedAheadSeconds": 18,
  "avgPeerThroughputBytesPerSecond": 900000
}
```

## 12. Abuse Controls

Minimum controls before public deployment:

```text
rate limit tracker announce
rate limit peer lookup
rate limit signaling messages
limit peers per room response
ban invalid hash senders locally
cool down failing peers
require signed manifests
require playback token for protected content
expire stale peers quickly
```

Do not allow peers to announce arbitrary content without validation.

## 13. Validation Checklist

### Local validation

```text
worker starts with wrangler dev
/health returns ok
/providers returns configured providers
manifest loads in browser
segments download from CDN
segments hash verify
MediaSource playback starts
```

### Peer validation

```text
two browsers join same asset room
peer joined event received
WebRTC data channel opens
peer announces cached chunks
other peer looks up chunk
range request succeeds
assembled chunk hash matches manifest
```

### TURN validation

```text
force relay candidate policy if testing
confirm connection still works
watch TURN bandwidth usage
verify credentials expire
```

### Failure validation

```text
block CDN A
confirm CDN B used
block all CDNs
confirm peer fallback used
send bad range data
confirm peer penalty
stall peer response
confirm range retry
```

## 14. Minimum Launch Sequence

```text
1. Deploy object storage origin
2. Encode one test video into aligned segments
3. Generate byte lengths and SHA256 hashes
4. Create mgp-manifest.json
5. Upload segments and manifest to origin
6. Configure two or more CDNs over origin
7. Deploy Worker with Durable Object signaling
8. Deploy TURN server
9. Add short lived TURN credentials
10. Open demo player with two browsers
11. Confirm CDN playback
12. Confirm peer announcement
13. Confirm peer range transfer
14. Confirm assembled hash verification
15. Confirm failover behavior
```

## 15. Production Readiness Gate

Do not consider it production ready until all are true:

```text
TURN works regionally
manifest signatures are enforced
segment hashes are verified
metrics are collected centrally
CDN failover is tested
peer invalid data is punished
room partitioning is enabled
rate limits are active
encoding pipeline is repeatable
rollback path exists
```

## 16. Practical First Deployment

Start with one public domain and one test asset.

Recommended first stack:

```text
Cloudflare Worker for edge router and signaling
Cloudflare R2 or S3 for origin
CloudFront as CDN A
Bunny as CDN B
Fastly as CDN C if available
coturn on a small VPS for TURN
one encoded test video
one signed JSON manifest
```

Once that works, add:

```text
regional TURN
more CDN providers
metrics backend
automated encoder
signed playback tokens
cost aware routing
```
