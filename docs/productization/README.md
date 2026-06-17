# Productization Readiness

This folder prepares Flareless to move from a local demo into a real operator tool.

The current demo is useful because it shows route decisions, provider health, topology state, recommendations, approvals, and audit evidence. A real tool needs stronger boundaries: durable state, provider adapters, health probes, authentication, topology governance, release packaging, and operational safety.

## Documents

| Document | Purpose |
| --- | --- |
| [Production readiness checklist](./production-readiness.md) | What must be true before calling Flareless a real operational tool. |
| [Control plane plan](./control-plane-plan.md) | How the demo should split into runtime, control plane, UI, and persistence services. |
| [Data model contracts](./data-model-contracts.md) | Stable objects the UI and backend should share. |
| [Security and operator safety](./security-and-operator-safety.md) | Guardrails for secrets, approvals, provider actions, and peer trust. |
| [MVP build order](./mvp-build-order.md) | Practical sequence for turning the demo into a product. |

## Product direction

Flareless should become an operator controlled traffic director, not just a visualization. The UI should stay honest by separating:

```text
configured topology
observed provider health
computed route decision
operator approved action
audit evidence
```

The goal is not to automatically mutate production traffic without review. The goal is to make failure state visible, produce safe recommendations, and execute only bounded, explainable changes.
