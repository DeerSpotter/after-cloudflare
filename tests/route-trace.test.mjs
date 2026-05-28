import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import worker, { DemoPresenceRoom } from "../src/worker.js";
import { resetHealthState } from "../src/routing/health.js";

beforeEach(() => {
    resetHealthState();
});

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
            get(id) {
                return presenceRoom;
            }
        }
    };
}

function edgeRequest(path) {
    return new Request("https://edge.example.com" + path);
}

function routeTracePost(routeTrace) {
    return new Request("https://edge.example.com/agent/cdn-control", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify({ routeTrace })
    });
}

function decodeRouteTraceHeader(response) {
    const rawTrace = response.headers.get("x-flareless-route-trace");
    assert.equal(typeof rawTrace, "string");
    return JSON.parse(decodeURIComponent(rawTrace));
}

test("successful provider route emits a route trace header", async () => {
    const oldFetch = globalThis.fetch;

    globalThis.fetch = async function() {
        return new Response("ok", { status: 200 });
    };

    try {
        const response = await worker.fetch(edgeRequest("/video/trace/v1/chunk-0001.m4s"), makeEnv(), {});
        const routeTrace = decodeRouteTraceHeader(response);

        assert.equal(response.status, 200);
        assert.equal(routeTrace.routeKey, "route:/video/trace/v1");
        assert.equal(routeTrace.policyId, "video-public-peer-first");
        assert.equal(routeTrace.selectedFallback, null);
        assert.deepEqual(routeTrace.attempts, [
            {
                provider: "cdn-a",
                result: "PROVIDER_SUCCESS"
            }
        ]);
        assert.equal(routeTrace.finalStatus.outcome, "provider-success");
        assert.equal(routeTrace.finalStatus.statusCode, 200);
        assert.equal(routeTrace.finalStatus.provider, "cdn-a");
        assert.equal(routeTrace.finalStatus.reason, "PRIMARY_PROVIDER_SUCCESS");
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("peer fallback emits a route trace header with selected fallback", async () => {
    const oldFetch = globalThis.fetch;

    globalThis.fetch = async function() {
        return new Response("unavailable", { status: 503 });
    };

    try {
        const response = await worker.fetch(edgeRequest("/video/trace-fallback/v1/chunk-0001.m4s"), makeEnv(), {});
        const routeTrace = decodeRouteTraceHeader(response);

        assert.equal(response.status, 503);
        assert.equal(routeTrace.routeKey, "route:/video/trace-fallback/v1");
        assert.equal(routeTrace.policyId, "video-public-peer-first");
        assert.equal(routeTrace.selectedFallback, "peer-fallback");
        assert.equal(routeTrace.attempts.length, 3);
        assert.equal(routeTrace.finalStatus.outcome, "peer-fallback");
        assert.equal(routeTrace.finalStatus.statusCode, 503);
        assert.equal(routeTrace.finalStatus.provider, null);
        assert.equal(routeTrace.finalStatus.reason, "ALL_PROVIDERS_FAILED_PEER_FALLBACK_SELECTED");
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("agent control endpoint analyzes posted route trace", async () => {
    const routeTrace = {
        requestId: "trace-test-001",
        routeKey: "route:/video/posted/v1",
        policyId: "video-public-peer-first",
        attempts: [
            {
                provider: "cdn-a",
                result: "PROVIDER_TIMEOUT"
            },
            {
                provider: "cdn-b",
                result: "PROVIDER_BLOCKED_429"
            },
            {
                provider: "cdn-c",
                result: "PROVIDER_SUCCESS"
            }
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
                fallbackAllowed: {
                    peer: true,
                    origin: false
                }
            },
            {
                sequence: 2,
                stage: "PROVIDER_BLOCKED_STATUS",
                code: "PROVIDER_BLOCKED_429",
                provider: "cdn-b",
                routeKey: "route:/video/posted/v1",
                chunkKey: "chunk:/video/posted/v1/chunk-0001.m4s",
                policyId: "video-public-peer-first",
                fallbackAllowed: {
                    peer: true,
                    origin: false
                }
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

    const response = await worker.fetch(routeTracePost(routeTrace), makeEnv(), {});
    const report = await response.json();

    assert.equal(response.status, 200);
    assert.equal(report.routeKey, "route:/video/posted/v1");
    assert.equal(report.policyId, "video-public-peer-first");
    assert.equal(report.summary.attemptCount, 3);
    assert.deepEqual(report.summary.timeoutProviders, ["cdn-a"]);
    assert.deepEqual(report.summary.blockedProviders, ["cdn-b"]);
    assert.deepEqual(report.summary.failedProviders, ["cdn-a", "cdn-b"]);
    assert.equal(report.failurePointSummary.count, 2);
    assert.equal(report.recommendation.id, "COOLDOWN_FAILED_PROVIDERS_KEEP_PEER");
});
