import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

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
