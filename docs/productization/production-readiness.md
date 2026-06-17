# Production Readiness Checklist

This checklist is the line between a local demo and a real operational tool.

## 1. Operator safety

- [ ] No production traffic mutation without an explicit approval policy.
- [ ] Every route change has a reason code.
- [ ] Every recommendation has before and after state.
- [ ] Every approval or rejection is written to an audit log.
- [ ] Emergency rollback is available from the UI and API.
- [ ] Startup is safe by default: no auto polling, no auto scenario, no traffic mutation.

## 2. Provider registry

- [ ] Providers are stored in a durable registry.
- [ ] Provider records have stable IDs, display names, type, priority, endpoint templates, and health probe config.
- [ ] Secrets are referenced by secret IDs, never stored in topology JSON.
- [ ] Provider onboarding validates URLs, headers, timeout budgets, and auth mode.
- [ ] Provider deletion requires confirmation and records an audit event.

## 3. Health checks

- [ ] Health checks run out of band from user traffic.
- [ ] Each provider has timeout, status code, latency, and content verification probes.
- [ ] Probe results are time windowed, not single sample only.
- [ ] Health state has explicit states: `healthy`, `degraded`, `failed`, `disabled`, `unknown`.
- [ ] Probe regions are tracked separately when multi region checks exist.

## 4. Routing engine

- [ ] Routing decisions are deterministic for the same inputs.
- [ ] Policy inputs are versioned.
- [ ] Route attempts are recorded with timestamps and elapsed milliseconds.
- [ ] Failure points are normalized.
- [ ] Circuit breaker state is separate from provider config.
- [ ] All fallback paths are policy gated.

## 5. Topology management

- [ ] Topology is stored as a versioned config object.
- [ ] Nodes and links can be edited visually and through JSON.
- [ ] Every topology save creates a snapshot.
- [ ] Snapshots can be restored.
- [ ] Topology validation rejects duplicate IDs, dangling links, invalid coordinates, and unsupported node types.
- [ ] The topology page distinguishes configured topology from observed runtime state.

## 6. Persistence

- [ ] Runtime state is not only in browser memory.
- [ ] Scenario history, audit events, topology snapshots, provider registry, and health history persist across restarts.
- [ ] Data files have schema versions.
- [ ] Corrupt state files fail safely and create a recovery copy.
- [ ] A future production service can swap JSON files for SQLite/Postgres without changing the UI contract.

## 7. Security

- [ ] No secrets in repository files.
- [ ] No secrets in route traces.
- [ ] No secrets in UI local storage.
- [ ] Provider auth supports scoped credentials.
- [ ] Peer/micro CDN features never serve arbitrary private content.
- [ ] Manifest and hash validation are enforced before peer bytes are trusted.

## 8. Packaging

- [ ] Release zip contains only required runtime files, docs, UI, launchers, and examples.
- [ ] Installer checks Python version.
- [ ] Installer checks pywebview.
- [ ] Launcher gives clear error messages.
- [ ] Release notes are versioned.
- [ ] Release artifact can be reproduced locally.

## 9. Testing

- [ ] Backend API contracts are tested.
- [ ] UI state transitions are tested.
- [ ] Topology save/load/restore is tested.
- [ ] Custom scenarios are tested.
- [ ] Health simulation settings are tested.
- [ ] Release zip contents are tested.
- [ ] Startup paused behavior is tested.

## 10. First real tool exit criteria

Flareless can be called a real operator tool when it can do all of this locally without fake claims:

```text
load configured providers
run health probes
compute a route decision
show live topology state
create a recommendation
require operator approval
record audit evidence
persist history
rollback to the prior safe state
package as a repeatable release
```
