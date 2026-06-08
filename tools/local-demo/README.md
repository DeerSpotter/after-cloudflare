# Flareless Local Demo Console

The local demo console is the recommended first release experience for Flareless.

It gives new users a visual way to understand the project without needing Cloudflare Workers, external CDNs, a database, WebRTC, or a production control plane.

<p align="center">
  <img
    src="./assets/Screenshot 2026-06-08 074724.png"
    alt="Flareless Local Demo Console dashboard screenshot"
    width="1000">
</p>

## Positioning

Use this wording:

```text
Local prototype console for route failure, agent recommendation, operator approval, and audit logging.
```

Avoid this wording:

```text
production peer CDN
AI controlled CDN
autonomous CDN control
self healing internet
```

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

## Run it

From the repository root:

```bash
python tools/local-demo/run_demo.py
```

That starts the local server and opens the Tkinter client.

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

The CI workflow also runs this command in the `local-demo` job.

The checks prove:

```text
routeTrace top-level shape stays stable
the golden provider chain remains cdn-a timeout, cdn-b 429, cdn-c success
scenario fixtures load cleanly
pending recommendations can be created
approval and rejection require an operator
audit events are appended
invalid double decisions are rejected
micro CDN status does not claim real peer transfer or detached signatures
compatibility endpoints remain available
```

## Guided experience

The GUI includes a menu bar and playback controls so a new user can walk through the story without knowing the internals first.

Menu groups:

```text
File
Scenarios
Actions
View
Help
```

The top control bar includes:

```text
Run scenario
Start auto tour
Stop
Reset state
```

The auto tour walks through the main story:

```text
healthy route
HTTP status failover
blocked provider failover
all providers failed
origin fallback blocked by policy
micro CDN approved content
micro CDN no healthy node
operator/audit review
```

The progress bar shows the current tour position. The tour switches tabs automatically so screenshots and screen recordings tell the story clearly.

## Scenarios

The first release includes these scenarios:

```text
healthy-route
http-status-failover
timeout-failover
blocked-provider
all-providers-failed
origin-blocked
microcdn-hello
microcdn-no-healthy-node
```

Each scenario updates the same model:

```text
providers
headers
routeTrace
agent recommendation
audit log
```

## GUI tabs

### Dashboard

Shows the selected scenario, route key, policy ID, route status, active provider, route reason, pending recommendation count, audit count, and honest boundaries.

### Providers

Shows provider status, latency, last result, and route scoped health.

### Route Trace

Shows the current route trace JSON and generated `x-flareless-*` explanation headers. This maps to the existing Flareless `routeTrace` shape:

```text
requestId
routeKey
policyId
attempts
failurePoints
selectedFallback
finalStatus
```

### Agent Recommendation

Shows the latest recommendation, status, severity, summary, reason codes, and scoped proposed action.

### Operator Approval

Lets a local operator approve or reject the latest pending recommendation.

Approval only records a decision and audit event. It does not mutate live route policy yet.

### Audit Log

Shows lifecycle events for created, approved, and rejected recommendations.

### Micro CDN Status

Shows what is implemented and what is still future work in the optional micro CDN path.

## API endpoints

```text
GET  /status
GET  /scenarios
GET  /providers
GET  /route/trace
GET  /route/traces
GET  /route/traces/{traceId}
POST /route/simulate
POST /agent/cdn-control
GET  /agent/recommendations
POST /agent/recommendations
GET  /agent/recommendations/{recommendationId}
POST /agent/recommendations/{recommendationId}/approve
POST /agent/recommendations/{recommendationId}/reject
GET  /agent/audit-log
GET  /micro-cdn/status
GET  /microcdn/status
POST /state/reset
```

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
A local Python demo console that shows provider failure, route traces, agent assisted recommendations, operator approval, and audit logging.
```