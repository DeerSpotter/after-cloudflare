# MVP Build Order

This is the practical sequence for turning Flareless from a local demo into a real tool.

## Phase A: Local product foundation

Goal: make the local tool dependable and honest.

1. Stabilize the local API contracts.
2. Add schema versions to local JSON state files.
3. Add validation for providers, topology, scenarios, and health settings.
4. Add tests for every local API endpoint.
5. Keep startup paused by default.
6. Package a repeatable release zip.

Exit criteria:

```text
fresh clone -> install requirements -> start.bat -> local UI opens -> no auto mutation -> tests pass
```

## Phase B: Real health probes

Goal: move from scenario state to observed state.

1. Add provider probe configuration.
2. Add a probe runner with timeout budgets.
3. Store probe samples.
4. Compute rolling health state.
5. Show observed state separately from simulated state.
6. Add a manual probe button in the UI.

Exit criteria:

```text
operator can add a provider endpoint and see real latency/status without changing traffic
```

## Phase C: Durable operator history

Goal: make runs and decisions reviewable.

1. Persist route decisions.
2. Persist recommendation lifecycle.
3. Persist topology snapshots.
4. Add history export.
5. Add restore safety prompts.

Exit criteria:

```text
operator can close and reopen the app and still see prior runs, approvals, and topology changes
```

## Phase D: Provider registry

Goal: make providers user defined.

1. Add provider CRUD screens.
2. Validate endpoint templates.
3. Add auth reference field.
4. Add tags and priority.
5. Add disabled state.
6. Add provider deletion audit.

Exit criteria:

```text
operator can add Cloudflare/Fastly/CloudFront/custom CDN as records without editing JSON directly
```

## Phase E: Recommendation execution boundary

Goal: prepare for real changes without making them unsafe.

1. Add action plans separate from recommendations.
2. Add before/after diff.
3. Add rollback plan.
4. Add dry run mode.
5. Add approval policy.
6. Keep production execution disabled until provider adapters exist.

Exit criteria:

```text
a recommendation can produce a safe dry run action plan, but cannot mutate production by accident
```

## Phase F: First production adapter

Goal: integrate one real provider safely.

Start with read only capability:

```text
list configured domains
read health endpoint
read current status
```

Then add limited write capability behind explicit approvals:

```text
enable / disable provider route in local Flareless config
```

Do not start with provider API mutation. Start with local Flareless routing state.

## Phase G: Real Micro CDN boundary

Goal: keep peer delivery safe.

1. Enforce signed manifests.
2. Verify chunk hash before serving.
3. Add node identity.
4. Add node reputation.
5. Add bandwidth caps.
6. Add abuse reporting.

Exit criteria:

```text
peer bytes are never trusted because of a node claim; they are trusted only because they match the signed manifest
```
