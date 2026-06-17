# Services

This directory is the future home of production grade services that sit behind the Flareless UI and runtime.

The local demo is allowed to be simple and file backed. Production services should use stable API contracts and durable storage.

## Planned services

```text
control-api/          Operator API, validation, state access, audit append
health-probes/        Provider health checks and rolling health state
routing-engine/       Route decision computation and policy evaluation
recommendations/      Route trace analysis and operator recommendations
audit-store/          Append only audit/event log
provider-adapters/    Provider specific read/write integrations
```

## First service to build

Start with `health-probes/`.

Reason: real health observation is the safest first step toward a real tool. It does not mutate traffic, does not require production provider writes, and gives the UI meaningful live data.

## Boundary rule

Services should expose observed state and planned actions separately.

```text
observed state != recommended action != approved action != executed action
```

This separation prevents the UI from accidentally presenting a simulated or recommended state as a production change.
