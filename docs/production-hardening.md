# Production Hardening Guide

This system is architecturally complete, but production deployment requires additional controls.

## Edge Layer

- Enable request rate limiting
- Use Cloudflare firewall rules for abuse control
- Separate DNS from CDN provider

## CDN Strategy

- At least 3 independent CDN providers
- Regional routing enabled
- Cost based routing fallback

## Peer Network

- Enforce upload limits
- Track peer reputation
- Drop peers that fail hash verification

## Security

- Always verify SHA256 for chunks
- Never allow peers to serve authenticated content
- Never expose origin directly

## Signaling

- Use Durable Objects or WebSocket clusters
- Limit peers per room
- Add heartbeat timeout

## Scaling

- Use KV or D1 for persistent peer index
- Partition rooms per asset
- Use regional edge routing

## Monitoring

Track:

- CDN error rate
- peer success rate
- average latency
- buffering events

## Deployment Strategy

- Blue/green deployment for Worker
- gradual traffic shift
- monitor before scaling up

## Reality

This system improves resilience and cost efficiency.
It does not eliminate infrastructure needs.

Use hybrid model for best results.
