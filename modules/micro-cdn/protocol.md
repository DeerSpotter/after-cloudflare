# Micro CDN Protocol Draft

## Node registration

A node registers with the coordinator using:

```json
{
  "nodeId": "node-001",
  "region": "us-east",
  "maxDiskMb": 1024,
  "maxBandwidthMbps": 25,
  "microCdnEnabled": true,
  "publicAddress": "http://127.0.0.1:8081"
}
```

## Health report

```json
{
  "nodeId": "node-001",
  "online": true,
  "cacheHits": 42,
  "bytesServed": 10485760,
  "cachedFiles": 3,
  "uptimeSeconds": 3600
}
```

## Approved content registration

```json
{
  "contentId": "asset-001",
  "sha256": "hash_here",
  "url": "https://example.org/file.zip",
  "maxAgeSeconds": 86400
}
```

## Coordinator routing response

```json
{
  "contentId": "asset-001",
  "selectedNode": {
    "nodeId": "node-001",
    "downloadUrl": "http://127.0.0.1:8081/cache/asset-001"
  }
}
```

## Initial implementation constraints

1. HTTP only for local development
2. Public static files only
3. Hash verification required
4. No peer to peer mesh routing in v1
5. Coordinator remains centralized initially
6. No encrypted overlay network in v1
