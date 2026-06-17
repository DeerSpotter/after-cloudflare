# Data Model Contracts

These contracts define the objects Flareless should stabilize before becoming a real tool.

The names below should be treated as API contracts. The local demo can store them as JSON files, but the UI and backend should use the same shapes when the project moves to SQLite, Postgres, or a service control plane.

## Provider

```json
{
  "id": "cdn-a",
  "displayName": "Cloudflare",
  "kind": "cdn",
  "enabled": true,
  "priority": 10,
  "endpointTemplate": "https://cdn-a.example.com/{path}",
  "healthCheckId": "hc-cdn-a",
  "authRef": null,
  "tags": ["primary"],
  "createdAt": "2026-06-17T18:00:00Z",
  "updatedAt": "2026-06-17T18:00:00Z"
}
```

Rules:

- `id` is stable and never silently renamed.
- `authRef` references a secret store entry, not the secret itself.
- `endpointTemplate` must be validated before saving.

## Topology config

```json
{
  "schemaVersion": 1,
  "nodes": [
    { "id": "client-us", "label": "Client", "kind": "client", "x": 90, "y": 220, "radius": 38 },
    { "id": "flareless", "label": "Flareless", "kind": "director", "x": 310, "y": 220, "radius": 52 },
    { "id": "cdn-a", "label": "Cloudflare", "kind": "cdn", "x": 550, "y": 92, "radius": 42 }
  ],
  "links": [
    { "id": "l-client", "from": "client-us", "to": "flareless", "label": "ingress" },
    { "id": "l-cdn-a", "from": "flareless", "to": "cdn-a", "label": "24 ms" }
  ]
}
```

Rules:

- Link endpoints must exist.
- Node IDs must be unique.
- Positions are UI hints, not routing authority.
- Topology config says what exists. Runtime state says what is active or failed.

## Health sample

```json
{
  "providerId": "cdn-a",
  "state": "healthy",
  "latencyMs": 24,
  "statusCode": 200,
  "reason": "PROBE_SUCCESS",
  "region": "local",
  "sampledAt": "2026-06-17T18:00:00Z"
}
```

Allowed states:

```text
healthy
degraded
failed
disabled
unknown
```

## Route decision

```json
{
  "requestId": "trace-001",
  "routeKey": "route:/video/example/v1",
  "policyId": "video-public-peer-first",
  "policyVersion": 1,
  "attempts": [
    { "provider": "cdn-a", "result": "PROVIDER_TIMEOUT", "elapsedMs": 1500 },
    { "provider": "cdn-b", "result": "PROVIDER_BLOCKED_429", "elapsedMs": 240 },
    { "provider": "cdn-c", "result": "PROVIDER_SUCCESS", "elapsedMs": 90 }
  ],
  "failurePoints": [
    { "step": 1, "provider": "cdn-a", "kind": "PROVIDER_TIMEOUT" },
    { "step": 2, "provider": "cdn-b", "kind": "PROVIDER_BLOCKED_STATUS" }
  ],
  "selectedFallback": null,
  "finalStatus": {
    "outcome": "provider-success",
    "provider": "cdn-c",
    "statusCode": 200,
    "reason": "PROVIDER_TIMEOUT_FAILOVER"
  },
  "createdAt": "2026-06-17T18:00:00Z"
}
```

## Recommendation

```json
{
  "id": "rec-001",
  "routeDecisionId": "trace-001",
  "status": "pending",
  "severity": "warning",
  "summary": "Switch traffic to CloudFront because prior providers failed.",
  "reasonCodes": ["PROVIDER_TIMEOUT", "PROVIDER_BLOCKED_429"],
  "before": { "activeProvider": "cdn-a" },
  "after": { "activeProvider": "cdn-c" },
  "createdAt": "2026-06-17T18:00:00Z"
}
```

Allowed statuses:

```text
pending
approved
rejected
expired
superseded
```

## Audit event

```json
{
  "id": "evt-001",
  "type": "RECOMMENDATION_APPROVED",
  "actor": "local-operator",
  "subjectId": "rec-001",
  "payload": {
    "note": "approved from local UI"
  },
  "createdAt": "2026-06-17T18:00:00Z"
}
```

Rules:

- Audit events are append only.
- Events should not contain secrets.
- Events should contain enough data to explain what changed.

## Custom scenario

```json
{
  "id": "scenario-custom-001",
  "name": "CloudFront timeout then Fastly success",
  "steps": [
    { "provider": "cdn-c", "result": "PROVIDER_TIMEOUT", "latencyMs": 1500 },
    { "provider": "cdn-b", "result": "PROVIDER_SUCCESS", "latencyMs": 82 }
  ],
  "createdAt": "2026-06-17T18:00:00Z"
}
```

Custom scenarios should remain local unless explicitly exported.
