# Control Plane Productization Plan

The local demo currently combines several responsibilities in one Python server and browser UI. A real tool should split those responsibilities into clear surfaces while keeping the local demo as the first operator experience.

## Target components

```text
Desktop shell / Web UI
        |
        v
Local control API
        |
        +-- Provider registry
        +-- Topology service
        +-- Health probe service
        +-- Routing decision engine
        +-- Recommendation engine
        +-- Audit/event store
        +-- Packaging and diagnostics
```

## Component boundaries

### UI shell

Purpose: operator interaction.

Owns:

- Topology editing.
- Scenario building.
- Approval review.
- Route replay.
- Evidence display.
- Settings panels.

Does not own:

- Provider secrets.
- Probe execution.
- Production route mutation.
- Final route authority.

### Local control API

Purpose: stable local API that both the desktop UI and future services can use.

Owns:

- Input validation.
- Durable state reads and writes.
- Audit event append.
- Route decision requests.
- Snapshot restore.

### Provider registry

Purpose: model the things Flareless can route to.

Provider record shape:

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
  "tags": ["primary"]
}
```

### Topology service

Purpose: model what exists and how it is connected.

Topology should remain separate from provider health. A CDN node can exist while being failed, disabled, or unknown.

### Health probe service

Purpose: observe provider state without needing user traffic.

Probe output shape:

```json
{
  "providerId": "cdn-a",
  "state": "degraded",
  "latencyMs": 420,
  "statusCode": 503,
  "reason": "HTTP_503",
  "sampledAt": "2026-06-17T18:00:00Z",
  "region": "local"
}
```

### Routing decision engine

Purpose: compute what should happen, not directly mutate production.

Inputs:

- Request route key.
- Policy version.
- Provider registry.
- Health state.
- Topology state.
- Peer/micro CDN eligibility.

Outputs:

- Selected provider.
- Attempt chain.
- Failure points.
- Recommendation when manual approval is required.
- Evidence headers.

### Recommendation engine

Purpose: turn route traces into operator readable actions.

Recommendations should be reviewable and reversible.

### Audit/event store

Purpose: source of truth for what happened.

Events should include:

```text
PROVIDER_HEALTH_CHANGED
ROUTE_DECISION_CREATED
RECOMMENDATION_CREATED
RECOMMENDATION_APPROVED
RECOMMENDATION_REJECTED
TOPOLOGY_SAVED
TOPOLOGY_RESTORED
CUSTOM_SCENARIO_RUN
```

## Local-first path

Use JSON files for the local version, but shape them like future database tables:

```text
state/providers.json
state/topology-config.json
state/topology-snapshots.json
state/custom-scenarios.json
state/health-settings.json
state/audit-events.json
state/run-history.json
```

This gives us a clean migration path to SQLite or Postgres later.

## First production service split

The first service worth separating is health probes. It is the clearest line between demo and real tool.

```text
health probe service -> writes health samples -> control API -> UI/topology/routing engine
```

Do not start with provider mutation. Start with observation.
