import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import worker, { DemoPresenceRoom } from "../src/worker.js";
import {
    approveRecommendation,
    createRecommendationFromAgentReport,
    getRecommendation,
    lifecycleErrorResponse,
    listAuditEvents,
    listRecommendations,
    rejectRecommendation,
    resetRecommendationLifecycleForTests
} from "../src/agent/recommendationLifecycle.js";

beforeEach(() => {
    resetRecommendationLifecycleForTests();
});

function sampleAgentReport() {
    return {
        routeKey: "route:/video/example/v1",
        policyId: "video-public-peer-first",
        routeTrace: {
            requestId: "trace-001",
            routeKey: "route:/video/example/v1",
            policyId: "video-public-peer-first"
        },
        notices: [
            { severity: "error", code: "PROVIDER_TIMEOUT_DETECTED" },
            { severity: "info", code: "ROUTE_SCOPE_RETAINED" }
        ],
        recommendation: {
            id: "COOLDOWN_FAILED_PROVIDERS_KEEP_PEER",
            action: "COOLDOWN_FAILED_PROVIDERS_KEEP_PEER_FALLBACK",
            confidence: "high",
            reason: "Route provider failures were detected. Keep the recommendation scoped to this route.",
            cooldownProviderNames: ["cdn-a"],
            failurePointCode: "PROVIDER_TIMEOUT",
            keepPeerFallback: true,
            allowOriginFallback: false,
            routeKey: "route:/video/example/v1"
        }
    };
}

function sampleRouteTrace() {
    return {
        requestId: "trace-posted-001",
        routeKey: "route:/video/posted/v1",
        policyId: "video-public-peer-first",
        attempts: [
            { provider: "cdn-a", result: "PROVIDER_TIMEOUT" },
            { provider: "cdn-c", result: "PROVIDER_SUCCESS" }
        ],
        failurePoints: [
            {
                sequence: 1,
                stage: "PROVIDER_TIMEOUT",
                code: "PROVIDER_TIMEOUT",
                provider: "cdn-a",
                routeKey: "route:/video/posted/v1",
                chunkKey: "chunk:/video/posted/v1/chunk-0001.m4s",
                policyId: "video-public-peer-first",
                fallbackAllowed: { peer: true, origin: false }
            }
        ],
        selectedFallback: null,
        finalStatus: {
            outcome: "provider-success",
            statusCode: 200,
            provider: "cdn-c",
            reason: "PROVIDER_TIMEOUT_FAILOVER"
        }
    };
}

function makeEnv() {
    const presenceRoom = new DemoPresenceRoom({}, {});
    return {
        MGP_SIGNAL: {
            idFromName(name) {
                return name;
            },
            get(id) {
                return {
                    async fetch() {
                        return new Response("stub websocket room " + id, { status: 200 });
                    }
                };
            }
        },
        DEMO_PRESENCE: {
            idFromName(name) {
                return name;
            },
            get() {
                return presenceRoom;
            }
        }
    };
}

function jsonRequest(path, body) {
    return new Request("https://edge.example.com" + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
    });
}

test("creates a pending recommendation from an agent report", () => {
    const recommendation = createRecommendationFromAgentReport(sampleAgentReport());

    assert.equal(recommendation.recommendationId, "rec_000001");
    assert.equal(recommendation.requestId, "trace-001");
    assert.equal(recommendation.routeKey, "route:/video/example/v1");
    assert.equal(recommendation.policyId, "video-public-peer-first");
    assert.equal(recommendation.status, "pending");
    assert.equal(recommendation.severity, "error");
    assert.ok(recommendation.reasonCodes.includes("PROVIDER_TIMEOUT_DETECTED"));
    assert.ok(recommendation.reasonCodes.includes("COOLDOWN_FAILED_PROVIDERS_KEEP_PEER_FALLBACK"));
    assert.equal(recommendation.proposedAction.type, "policy_annotation");
    assert.equal(recommendation.proposedAction.scope, "route");
    assert.equal(recommendation.proposedAction.change.ttlSeconds, 900);
});

test("lists and reads recommendations", () => {
    const created = createRecommendationFromAgentReport(sampleAgentReport());
    const list = listRecommendations();
    const read = getRecommendation(created.recommendationId);

    assert.equal(list.length, 1);
    assert.equal(list[0].recommendationId, created.recommendationId);
    assert.equal(read.recommendationId, created.recommendationId);
});

test("approves a pending recommendation and records an audit event", () => {
    const created = createRecommendationFromAgentReport(sampleAgentReport());
    const approved = approveRecommendation(created.recommendationId, {
        operator: "reviewer",
        note: "Approved for route scoped demo."
    });
    const events = listAuditEvents();

    assert.equal(approved.status, "approved");
    assert.equal(events.length, 2);
    assert.equal(events[0].action, "created");
    assert.equal(events[1].action, "approved");
    assert.equal(events[1].actor, "reviewer");
    assert.equal(events[1].note, "Approved for route scoped demo.");
});

test("rejects a pending recommendation and records an audit event", () => {
    const created = createRecommendationFromAgentReport(sampleAgentReport());
    const rejected = rejectRecommendation(created.recommendationId, {
        operator: "reviewer",
        note: "Provider recovered."
    });
    const events = listAuditEvents();

    assert.equal(rejected.status, "rejected");
    assert.equal(events.length, 2);
    assert.equal(events[1].action, "rejected");
    assert.equal(events[1].actor, "reviewer");
    assert.equal(events[1].note, "Provider recovered.");
});

test("prevents approval without reviewer", () => {
    const created = createRecommendationFromAgentReport(sampleAgentReport());

    assert.throws(() => approveRecommendation(created.recommendationId, { note: "Missing reviewer." }), {
        message: "Operator is required for recommendation decisions."
    });
});

test("prevents rejection without reviewer", () => {
    const created = createRecommendationFromAgentReport(sampleAgentReport());

    assert.throws(() => rejectRecommendation(created.recommendationId, { note: "Missing reviewer." }), {
        message: "Operator is required for recommendation decisions."
    });
});

test("prevents double approval", () => {
    const created = createRecommendationFromAgentReport(sampleAgentReport());
    approveRecommendation(created.recommendationId, { operator: "reviewer" });

    assert.throws(() => approveRecommendation(created.recommendationId, { operator: "reviewer" }), {
        message: "Cannot approve recommendation because it is already approved."
    });
});

test("prevents approving a rejected recommendation", () => {
    const created = createRecommendationFromAgentReport(sampleAgentReport());
    rejectRecommendation(created.recommendationId, { operator: "reviewer" });

    assert.throws(() => approveRecommendation(created.recommendationId, { operator: "reviewer" }), {
        message: "Cannot approve recommendation because it is already rejected."
    });
});

test("returns null for missing recommendation", () => {
    assert.equal(getRecommendation("rec_missing"), null);
});

test("normalizes lifecycle errors for HTTP responses", () => {
    const created = createRecommendationFromAgentReport(sampleAgentReport());

    try {
        approveRecommendation(created.recommendationId, {});
        assert.fail("expected approval to fail without reviewer");
    } catch (err) {
        const response = lifecycleErrorResponse(err);
        assert.equal(response.status, 400);
        assert.equal(response.body.code, "OPERATOR_REQUIRED");
    }
});

test("worker creates and lists recommendation lifecycle records", async () => {
    const createResponse = await worker.fetch(jsonRequest("/agent/recommendations", { routeTrace: sampleRouteTrace() }), makeEnv(), {});
    const created = await createResponse.json();
    const listResponse = await worker.fetch(new Request("https://edge.example.com/agent/recommendations"), makeEnv(), {});
    const list = await listResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(created.recommendation.status, "pending");
    assert.equal(created.recommendation.requestId, "trace-posted-001");
    assert.equal(listResponse.status, 200);
    assert.equal(list.recommendations.length, 1);
});

test("worker approves recommendation and exposes audit log", async () => {
    const createResponse = await worker.fetch(jsonRequest("/agent/recommendations", { routeTrace: sampleRouteTrace() }), makeEnv(), {});
    const created = await createResponse.json();
    const approveResponse = await worker.fetch(jsonRequest("/agent/recommendations/" + created.recommendation.recommendationId + "/approve", {
        operator: "reviewer",
        note: "Approve route scoped action."
    }), makeEnv(), {});
    const approved = await approveResponse.json();
    const auditResponse = await worker.fetch(new Request("https://edge.example.com/agent/audit-log"), makeEnv(), {});
    const audit = await auditResponse.json();

    assert.equal(approveResponse.status, 200);
    assert.equal(approved.recommendation.status, "approved");
    assert.equal(auditResponse.status, 200);
    assert.equal(audit.auditLog.length, 2);
    assert.equal(audit.auditLog[1].action, "approved");
});

test("worker rejects recommendation without changing live route policy", async () => {
    const createResponse = await worker.fetch(jsonRequest("/agent/recommendations", { routeTrace: sampleRouteTrace() }), makeEnv(), {});
    const created = await createResponse.json();
    const rejectResponse = await worker.fetch(jsonRequest("/agent/recommendations/" + created.recommendation.recommendationId + "/reject", {
        operator: "reviewer",
        note: "Reject scoped action."
    }), makeEnv(), {});
    const rejected = await rejectResponse.json();

    assert.equal(rejectResponse.status, 200);
    assert.equal(rejected.recommendation.status, "rejected");
    assert.equal(rejected.recommendation.proposedAction.type, "policy_annotation");
});

test("worker blocks approval without reviewer", async () => {
    const createResponse = await worker.fetch(jsonRequest("/agent/recommendations", { routeTrace: sampleRouteTrace() }), makeEnv(), {});
    const created = await createResponse.json();
    const approveResponse = await worker.fetch(jsonRequest("/agent/recommendations/" + created.recommendation.recommendationId + "/approve", {
        note: "Missing reviewer."
    }), makeEnv(), {});
    const body = await approveResponse.json();

    assert.equal(approveResponse.status, 400);
    assert.equal(body.code, "OPERATOR_REQUIRED");
});
