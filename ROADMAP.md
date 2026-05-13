# Roadmap

After Cloudflare is being built as a provider neutral edge runtime and routing system. The goal is to route around outages, provider lock in, policy failures, degraded networks, and single vendor control.

This roadmap splits the project into modules so contributors can join without needing private context.

## Current tracks

### Runtime prototype

Path: `src/`

Purpose: Request handling, route selection, provider failover, manifest generation, and peer fallback responses.

Status: Active prototype.

Beginner tasks:

* Add route selector test cases for degraded providers.
* Add manifest examples for common video chunk paths.
* Improve provider configuration validation.

Advanced tasks:

* Add pluggable route policies.
* Add signed manifest verification.
* Add deterministic reason codes for every routing decision.

### Control plane scaffold

Path: `services/`

Purpose: Future services for health checks, route scoring, observability, and distributed control.

Status: Early Go scaffold.

Beginner tasks:

* Return structured JSON from the health check service.
* Add timeout configuration to probes.
* Add tests around route selection.

Advanced tasks:

* Add multi region probe aggregation.
* Add historical health windows.
* Add route scoring APIs consumed by the runtime.

### Peer assisted delivery

Paths: `public/`, `src/peer/`, `scripts/simulate-network.mjs`

Purpose: Peer fallback for immutable chunks when CDN routes are unavailable or degraded.

Status: Scheduler and simulator exist. WebRTC transport is still open.

Beginner tasks:

* Add simulator scenarios for full CDN failure.
* Add peer cooldown tests.
* Add invalid chunk rejection examples.

Advanced tasks:

* Implement WebRTC data channel chunk transfer.
* Add peer trust scoring.
* Add bandwidth aware upload limiting.

### Manifest and content integrity

Path: `src/mgp/`

Purpose: Define how assets, chunks, provider URLs, hashes, and signatures are represented.

Status: Basic manifest generation exists. Signed verification is not complete.

Beginner tasks:

* Add `manifest.schema.json`.
* Add example manifests under `examples/`.
* Add tests for path normalization.

Advanced tasks:

* Add signature verification.
* Add chunk hash validation.
* Add key rotation design.

### Provider adapter layer

Path: `src/routing/providerFetch.js`

Purpose: Translate incoming requests into provider specific fetches while preserving safe headers and routing metadata.

Status: Basic adapter exists.

Beginner tasks:

* Add provider config examples.
* Add provider timeout handling.
* Add tests for query string preservation.

Advanced tasks:

* Add per provider auth strategies.
* Add provider specific block detection.
* Add retry budgets and circuit breaker behavior.

### Security and abuse controls

Paths: `SECURITY.md`, future `src/security/`

Purpose: Keep the system useful without becoming an abuse platform.

Status: Policy document first. Enforcement modules later.

Beginner tasks:

* Document threat scenarios.
* Add abuse reporting guidance.
* Add test cases for disallowed peer trust shortcuts.

Advanced tasks:

* Add signed content enforcement.
* Add peer reputation penalties.
* Add origin access control rules.

## Priority sequence

1. Make the repo easy to clone, test, and understand.
2. Protect the Worker runtime with CI.
3. Define the architecture and module boundaries.
4. Implement signed manifests and content verification.
5. Harden provider failover.
6. Build WebRTC chunk transport.
7. Add distributed health checks.
8. Add production deployment examples.

## Definition of ready

A module is ready for broad contribution when it has:

* A clear purpose.
* A documented input and output.
* At least one test file.
* At least one good first issue.
* A maintainer note describing what should not be changed yet.

## Definition of done

A contribution is done when it:

* Builds locally.
* Passes CI.
* Adds or updates tests.
* Documents any new protocol behavior.
* Does not add vendor secrets or private credentials.
* Keeps the project provider neutral.
