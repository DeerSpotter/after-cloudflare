# Security and Operator Safety

Flareless should be useful during outages without becoming a system that hides dangerous behavior or makes unsafe automatic changes.

## Safety principles

1. Observe before mutating.
2. Explain before recommending.
3. Require approval before changing production traffic.
4. Log every operator decision.
5. Never store secrets in topology, route traces, UI state, or Git history.
6. Never trust peer bytes without manifest and hash verification.

## Secret handling

Provider credentials should be referenced, not embedded.

Bad:

```json
{
  "provider": "cdn-a",
  "apiToken": "secret-value"
}
```

Good:

```json
{
  "provider": "cdn-a",
  "authRef": "secret://local/cdn-a-readonly"
}
```

Local development can start with environment variables or OS keychain references. Production should use a real secret store.

## Provider actions

Provider mutation should be treated as privileged.

Examples of privileged actions:

```text
change traffic weight
disable provider
enable provider
purge cache
change origin path
change security rules
change DNS records
```

These should require:

- Operator identity.
- Reason code.
- Approval policy.
- Before and after diff.
- Audit event.
- Rollback plan.

## UI guardrails

The UI should visually separate:

```text
observed status
simulated scenario
recommended action
approved action
executed action
```

A future production screen should never let a simulated scenario look like live provider state.

## Peer and Micro CDN boundaries

Micro CDN and peer assisted delivery must stay public content only unless a future design explicitly proves otherwise.

Rules:

- No private traffic proxying.
- No arbitrary URL fetching from peers.
- No serving bytes without expected hash.
- No node can self approve content.
- Node reputation cannot override content integrity.

## Audit policy

Events that must be logged:

```text
PROVIDER_CREATED
PROVIDER_UPDATED
PROVIDER_DELETED
TOPOLOGY_SAVED
TOPOLOGY_RESTORED
HEALTH_STATE_CHANGED
ROUTE_DECISION_CREATED
RECOMMENDATION_CREATED
RECOMMENDATION_APPROVED
RECOMMENDATION_REJECTED
PRODUCTION_ACTION_EXECUTED
ROLLBACK_EXECUTED
```

Audit events should be append only and exportable.

## Red lines

Do not add these without a security design review:

- Automatic production provider mutation.
- Peer serving without hash verification.
- Secret values in JSON configs.
- Arbitrary public proxy mode.
- Hidden background telemetry.
- Unbounded retry storms during outage.
