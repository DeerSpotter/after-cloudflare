# Agent recommendation lifecycle

Flareless uses agent assisted route control, not autonomous CDN control.

The agent can analyze route traces and create a recommendation. It cannot directly change live routing policy. A human operator must approve or reject the recommendation, and each decision is recorded in an audit log.

## Lifecycle

```text
routeTrace created
agent analyzes routeTrace
agent creates recommendation
recommendation is stored as pending
operator approves or rejects
approved action remains scoped as a policy annotation
audit log records the decision
```

## Recommendation status

The MVP lifecycle supports:

```text
pending
approved
rejected
```

Reserved future statuses:

```text
expired
applied
```

## API

Create a pending recommendation from a route trace:

```text
POST /agent/recommendations
```

Body:

```json
{
  "routeTrace": {
    "requestId": "trace-001",
    "routeKey": "route:/video/example/v1",
    "policyId": "video-public-peer-first",
    "attempts": [
      {
        "provider": "cdn-a",
        "result": "PROVIDER_TIMEOUT"
      },
      {
        "provider": "cdn-c",
        "result": "PROVIDER_SUCCESS"
      }
    ],
    "selectedFallback": null,
    "finalStatus": {
      "outcome": "provider-success",
      "statusCode": 200,
      "provider": "cdn-c",
      "reason": "PROVIDER_TIMEOUT_FAILOVER"
    }
  }
}
```

List recommendations:

```text
GET /agent/recommendations
```

Read one recommendation:

```text
GET /agent/recommendations/{recommendationId}
```

Approve a recommendation:

```text
POST /agent/recommendations/{recommendationId}/approve
```

Body:

```json
{
  "operator": "reviewer",
  "note": "Approved for route scoped demo."
}
```

Reject a recommendation:

```text
POST /agent/recommendations/{recommendationId}/reject
```

Body:

```json
{
  "operator": "reviewer",
  "note": "Provider recovered."
}
```

Read the audit log:

```text
GET /agent/audit-log
```

## Guardrails

The MVP intentionally does not include:

```text
autonomous live route changes
external CDN API calls
private content routing changes
credential changes
production database persistence
full authentication
```

Approving a recommendation only records operator approval and keeps the proposed action scoped as a policy annotation. A later issue can decide whether approved recommendations should create short lived policy annotations in the route policy layer.

## Why this matters

This lifecycle makes the agent feature operationally believable without overclaiming.

Good wording:

```text
Agent assisted route control
```

Avoid this wording:

```text
AI controlled CDN
autonomous CDN control
self healing internet
```
