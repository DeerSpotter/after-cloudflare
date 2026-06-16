# Flareless Local Demo Console

The local Python console is the release focused first run experience for Flareless.

It starts a local server and opens a Tkinter command center that demonstrates failure aware route control, agent recommendations, operator approval, audit evidence, and Micro CDN trust boundaries without requiring Cloudflare Workers, external CDNs, a database, WebRTC, or a production control plane.

## What changed for the release build

The console is now the primary UI. The static `demo/` page remains the lightweight mobile browser demo.

The Python console includes:

```text
Global Smart Traffic & Failover Map
OSIRIS inspired 2D vector map assets
normalized provider health
route attempt chain
visual route policy builder
YAML and JSON policy export
agent recommendation inbox
operator approve or reject flow
micro CDN trust dashboard
generated x-flareless-* evidence headers
route trace JSON
audit log
release tour playback
```

## OSIRIS 2D map asset reuse

The map uses the lightweight fallback world rings, palette, and map style metadata from `DeerSpotter/osiris-v2`.

For the first release, the Tkinter map intentionally uses the embedded vector fallback instead of live web tiles. That keeps the demo offline friendly and avoids adding runtime network dependencies.

The copied metadata lives in:

```text
tools/local-demo/osiris_map_assets.py
```

## Run it

From the repository root:

```bash
python tools/local-demo/run_demo.py
```

That starts the local server and opens the Tkinter release console.

Alternative two terminal flow:

```bash
python tools/local-demo/server.py
```

Then:

```bash
python tools/local-demo/client.py
```

The server listens at:

```text
http://127.0.0.1:8765
```

## Test it

From the repository root:

```bash
python tools/local-demo/run_tests.py
```

The test runner performs these checks:

```text
compile all local demo Python files
validate scenario fixture contracts
run unittest API and lifecycle coverage
```

The local demo tests also cover the Python 3.12 import path used by CI.

## What it demonstrates

The console demonstrates the strongest current identity of Flareless:

```text
failure aware route control plus agent assisted recommendations
```

It shows:

```text
provider health
route attempts
route trace JSON
failure points
agent recommendation
operator approval or rejection
audit log
micro CDN trust model boundaries
```

## What it does not claim

The local demo does not implement:

```text
real peer chunk transfer
distributed health checks
detached manifest signatures
production control plane
external CDN API integration
```

Those remain future work.

## GUI screens

### Command Center

Shows the OSIRIS style 2D route map, provider health, active route, pending approval count, and route attempt chain.

### Policy Builder

Builds a provider neutral `IF / AND / THEN` route policy and exports it as YAML or JSON. The test button runs a local simulation only and does not mutate live policy.

### Approvals

Shows the agent recommendation inbox and lets an operator approve or reject the latest pending recommendation.

### Micro CDN Trust

Shows peer style trust evidence and the current implementation boundaries. It remains honest about what is local hash verified and what is still future work.

### Evidence

Shows generated `x-flareless-*` headers and route trace JSON.

### Audit

Shows lifecycle events for created, approved, and rejected recommendations.

## Release recommendation

Use this as the first release artifact:

```text
v0.1.0-local-demo-console
```

Suggested release title:

```text
Flareless v0.1.0: Failure Aware Route Control Demo
```

Suggested release description:

```text
A local Python command center that shows provider failure, route traces, agent assisted recommendations, operator approval, audit logging, and Micro CDN trust boundaries.
```
