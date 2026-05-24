import test from "node:test";
import assert from "node:assert/strict";

import { createFailurePointTracker, formatFailurePointHeader, summarizeFailurePoints } from "../src/agent/failurePointTracker.js";

test("failure point tracker records provider timeout and blocked status stages", () => {
    const tracker = createFailurePointTracker(
        {
            routeKey: "route:/video/test.ts",
            chunkKey: "chunk:/video/test.ts"
        },
        {
            id: "video-public-peer-first",
            allowPeerFallback: true,
            allowOriginFallback: false
        }
    );

    tracker.addProviderFailure("cdn-a", "PROVIDER_TIMEOUT", { source: "providerFetch" });
    tracker.addProviderFailure("cdn-b", "PROVIDER_BLOCKED_429", { status: 429 });

    const failurePoints = tracker.snapshot();

    assert.equal(failurePoints.length, 2);
    assert.equal(failurePoints[0].stage, "PROVIDER_TIMEOUT");
    assert.equal(failurePoints[0].provider, "cdn-a");
    assert.equal(failurePoints[1].stage, "PROVIDER_BLOCKED_STATUS");
    assert.equal(failurePoints[1].provider, "cdn-b");
});

test("failure point summary captures first and last point", () => {
    const tracker = createFailurePointTracker(
        {
            routeKey: "route:/private/file.txt",
            chunkKey: "chunk:/private/file.txt"
        },
        {
            id: "private-no-fallback",
            allowPeerFallback: false,
            allowOriginFallback: false
        }
    );

    tracker.addProviderFailure("cdn-a", "PROVIDER_TIMEOUT");
    tracker.addPolicyBlockedPoint("FALLBACK_BLOCKED_BY_POLICY");

    const summary = summarizeFailurePoints(tracker.snapshot());

    assert.equal(summary.count, 2);
    assert.equal(summary.firstFailurePoint.stage, "PROVIDER_TIMEOUT");
    assert.equal(summary.lastFailurePoint.stage, "POLICY_BLOCKED_FALLBACK");
    assert.equal(summary.stageCounts.PROVIDER_TIMEOUT, 1);
    assert.equal(summary.stageCounts.POLICY_BLOCKED_FALLBACK, 1);
});

test("failure point header is compact and ordered", () => {
    const tracker = createFailurePointTracker(
        {
            routeKey: "route:/video/test.ts",
            chunkKey: "chunk:/video/test.ts"
        },
        {
            id: "video-public-peer-first",
            allowPeerFallback: true,
            allowOriginFallback: false
        }
    );

    tracker.addProviderFailure("cdn-a", "PROVIDER_TIMEOUT");
    tracker.addPeerFallbackPoint("PEER_FALLBACK_SELECTED");

    assert.equal(
        formatFailurePointHeader(tracker.snapshot()),
        "1:PROVIDER_TIMEOUT:cdn-a:PROVIDER_TIMEOUT,2:PEER_FALLBACK_DECISION:PEER_FALLBACK_SELECTED"
    );
});
