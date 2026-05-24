<p align="center">
  <a href="#milestone-0-contributor-landing-zone" title="Contributor landing zone"><img src="https://img.shields.io/badge/M0-landing-2ea44f" alt="milestone 0 landing"></a><br>
  <a href="#milestone-1-routing-foundation" title="Routing foundation"><img src="https://img.shields.io/badge/M1-routing-6f42c1" alt="milestone 1 routing"></a><br>
  <a href="#milestone-3-content-trust-and-manifests" title="Content trust and manifests"><img src="https://img.shields.io/badge/M3-trust-f9c513" alt="milestone 3 trust"></a><br>
  <a href="#milestone-4-peer-assisted-fallback" title="Peer assisted fallback"><img src="https://img.shields.io/badge/M4-peer-d73a49" alt="milestone 4 peer"></a>
</p>

# Milestones

These milestones define the build path for Flareless. They are written so new contributors can understand what matters first, what is blocked, and where their work fits.

> [!NOTE]
> Milestones are ordered so contributors can see what is already usable, what is active, and what is still blocked by earlier trust or routing work.

## Milestone 0: Contributor landing zone

Goal: Make the project easy to clone, understand, test, and contribute to.

Status: Mostly complete.

Primary outputs:

1. README links to contributor documents.
2. QUICKSTART explains local setup.
3. ROADMAP defines module boundaries.
4. CONTRIBUTING defines working style.
5. ARCHITECTURE explains the system.
6. SECURITY defines trust boundaries.
7. CODE_OF_CONDUCT keeps the project useful.
8. CI runs both Worker runtime tests and Go checks.

Related issues:

1. Issue 1: Define the contributor roadmap and module boundaries.
2. Issue 9: Add manifest JSON schema and examples.
3. Issue 10: Add provider configuration examples.

Exit criteria:

1. A new contributor can run tests locally.
2. A new contributor can run the local edge runtime.
3. A new contributor can pick a first issue without private context.
4. README points to every important contributor document.

> [!TIP]
> This milestone is about reducing contributor friction before pushing deeper protocol or transport work.

## Milestone 1: Routing foundation

Goal: Make provider routing explainable, testable, and configurable.

Status: Active.

Primary outputs:

1. Provider config examples.
2. Route decision reason codes.
3. Deterministic route selection tests.
4. Provider failure and block behavior tests.
5. Clear separation between runtime routing and future control plane routing.

Related issues:

1. Issue 3: Implement traffic director engine.
2. Issue 4: Design and implement route selection algorithm.
3. Issue 10: Add provider configuration examples.
4. Issue 11: Add route decision reason codes.

Exit criteria:

1. Routes are selected deterministically.
2. Decisions include explanation metadata.
3. Provider config examples are documented.
4. Fallback behavior is covered by tests.
5. A contributor can add a new provider without changing core routing logic.

## Milestone 2: Health and observability

Goal: Make provider health measurable enough to drive safe failover.

Status: Planned.

Primary outputs:

1. Structured health check results.
2. Timeout aware probes.
3. Latency and failure history.
4. Block response detection.
5. Health data that routing can consume.

Related issues:

1. Issue 2: Implement CDN health check service with multi region validation.
2. Issue 3: Implement traffic director engine.
4. Issue 11: Add route decision reason codes.

Exit criteria:

1. Health checks produce structured JSON.
2. The router can consume mock or live health data.
3. Failed providers are avoided for a defined cooldown window.
4. Health state is visible through a documented endpoint.
5. Tests cover healthy, degraded, blocked, and failed providers.

## Milestone 3: Content trust and manifests

Goal: Make content verification explicit before peer delivery becomes real.

Status: Planned.

Primary outputs:

1. Manifest JSON schema.
2. Example manifests.
3. Chunk hash fields.
4. Signature fields.
5. Verification utility or verification stub.
6. Security documentation linked to manifest behavior.

Related issues:

1. Issue 5: Define signed manifest format for chunk validation.
2. Issue 9: Add manifest JSON schema and examples.

Exit criteria:

1. Manifest schema exists.
2. Example manifests validate against the schema.
3. Chunk hashes are represented clearly.
4. Signature fields are represented clearly.
5. Peer delivery work has a defined trust contract.

> [!IMPORTANT]
> Peer fallback should not move ahead of content trust. Hashes, manifests, and verification rules are the safety contract.

## Milestone 4: Peer assisted fallback

Goal: Make peer fallback safe, simulated, and ready for transport work.

Status: Active prototype.

Primary outputs:

1. Peer fallback response model.
2. Adaptive peer scheduler tests.
3. Offline simulation scenarios.
4. Invalid peer chunk penalties.
5. Upload limiting rules.
6. Documentation for peer trust assumptions.

Related issues:

1. Issue 6: Build peer assisted delivery fallback layer.
2. Issue 7: Implement WebRTC chunk transport protocol.
3. Issue 12: Add WebRTC transport design note.

Exit criteria:

1. CDN failure can trigger a peer fallback path.
2. Simulator can model provider block and peer failure cases.
3. Invalid peer responses are penalized.
4. Peer trust assumptions are documented.
5. WebRTC implementation has a design target.

## Milestone 5: WebRTC transport

Goal: Move peer fallback from design and simulation into a basic browser transport.

Status: Planned.

Primary outputs:

1. WebRTC transport design note.
2. Signaling flow.
3. Data channel chunk request format.
4. Retry behavior.
5. Chunk verification before use.
6. Basic two peer transfer test.

Related issues:

1. Issue 7: Implement WebRTC chunk transport protocol.
2. Issue 12: Add WebRTC transport design note.

Exit criteria:

1. Two peers can establish a data channel.
2. One peer can request a chunk from another peer.
3. Transfer failure retries are defined.
4. Hash validation is required before accepting a chunk.
5. The browser transport does not bypass the security model.

> [!WARNING]
> Transport work must not bypass verification. A working peer transfer is not complete until unsafe chunks are rejected.

## Milestone 6: Demo quality release

Goal: Package the project so outside engineers can show a working story in minutes.

Status: Future.

Primary outputs:

1. Local demo script.
2. Provider failure simulation.
3. Manifest example.
4. Peer fallback simulation.
5. Clear screenshots or terminal examples.
6. Release notes.

Related issues:

1. Issue 9: Add manifest JSON schema and examples.
2. Issue 10: Add provider configuration examples.
3. Issue 11: Add route decision reason codes.
4. Issue 12: Add WebRTC transport design note.

Exit criteria:

1. A contributor can run one command and see the routing model work.
2. A contributor can simulate provider failure.
3. A contributor can inspect why a route was chosen.
4. A contributor can explain the value of the project without private context.
