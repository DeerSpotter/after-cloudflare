import test from "node:test";
import assert from "node:assert/strict";

import { createAgentCdnControlReport, applyAgentRecommendationToPolicy } from "../src/agent/cdnControl.js";

test("agent recommends cooling failed providers while keeping peer fallback", () => {
    const report = createAgentCdnControlReport({
        attempts: [
            { provider: "cdn-a", result: "PROVIDER_TIMEOUT" },
            { provider: "cdn-b", result: "PROVIDER_BLOCKED_429" },
            { provider: "cdn-c", result: "PROVIDER_SUCCESS" }
        ],
        routePolicy: {
            id: "video-public-peer-first",
            allowPeerFallback: true,
            allowOriginFallback: false,
            healthScope: "route",
            pathPrefix: "/video/"
        },
        routeScope: {
            routeKey: "route:/video/show-name/episode-001/v17/720p/chunk-0001.ts",
            chunkKey: "chunk:/video/show-name/episode-001/v17/720p/chunk-0001.ts",
            path: "/video/show-name/episode-001/v17/720p/chunk-0001.ts"
        }
    });

    assert.equal(report.agent, "flareless-agent-cdn-control");
    assert.equal(report.mode, "observe-and-recommend");
    assert.equal(report.summary.success, true);
    assert.deepEqual(report.summary.timeoutProviders, ["cdn-a"]);
    assert.deepEqual(report.summary.blockedProviders, ["cdn-b"]);
    assert.equal(report.recommendation.action, "COOLDOWN_FAILED_PROVIDERS_KEEP_PEER_FALLBACK");
    assert.deepEqual(report.recommendation.cooldownProviderNames, ["cdn-a", "cdn-b"]);
    assert.equal(report.proposedPolicy.allowPeerFallback, true);
    assert.equal(report.proposedPolicy.allowOriginFallback, false);
});

test("agent preserves fail closed behavior when route policy blocks fallback", () => {
    const report = createAgentCdnControlReport({
        attempts: [
            { provider: "cdn-a", result: "PROVIDER_TIMEOUT" },
            { provider: "cdn-b", result: "PROVIDER_FETCH_ERROR" }
        ],
        routePolicy: {
            id: "private-no-fallback",
            allowPeerFallback: false,
            allowOriginFallback: false,
            healthScope: "route",
            pathPrefix: "/private/"
        },
        routeScope: {
            routeKey: "route:/private/file.txt",
            chunkKey: "chunk:/private/file.txt",
            path: "/private/file.txt"
        }
    });

    assert.equal(report.recommendation.action, "COOLDOWN_FAILED_PROVIDERS_FAIL_CLOSED");
    assert.deepEqual(report.recommendation.cooldownProviderNames, ["cdn-a", "cdn-b"]);
    assert.equal(report.proposedPolicy.allowPeerFallback, false);
    assert.equal(report.proposedPolicy.allowOriginFallback, false);
});

test("agent observes healthy route without recommending policy change", () => {
    const report = createAgentCdnControlReport({
        attempts: [
            { provider: "cdn-a", result: "PROVIDER_SUCCESS" }
        ],
        routePolicy: {
            id: "default-public-static",
            allowPeerFallback: true,
            allowOriginFallback: false,
            healthScope: "route",
            pathPrefix: "/"
        },
        routeScope: {
            routeKey: "route:/asset.txt",
            chunkKey: "chunk:/asset.txt",
            path: "/asset.txt"
        }
    });

    assert.equal(report.recommendation.action, "OBSERVE_ONLY");
    assert.equal(report.recommendation.confidence, "high");
    assert.deepEqual(report.recommendation.cooldownProviderNames, []);
});

test("applyAgentRecommendationToPolicy annotates proposed policy", () => {
    const proposedPolicy = applyAgentRecommendationToPolicy(
        {
            id: "video-public-peer-first",
            allowPeerFallback: true,
            allowOriginFallback: false,
            healthScope: "route",
            pathPrefix: "/video/"
        },
        {
            id: "COOLDOWN_FAILED_PROVIDERS_KEEP_PEER",
            action: "COOLDOWN_FAILED_PROVIDERS_KEEP_PEER_FALLBACK",
            reason: "cool down failed providers",
            cooldownProviderNames: ["cdn-a"],
            keepPeerFallback: true,
            allowOriginFallback: false
        }
    );

    assert.equal(proposedPolicy.agentAssisted, true);
    assert.equal(proposedPolicy.agentAction, "COOLDOWN_FAILED_PROVIDERS_KEEP_PEER_FALLBACK");
    assert.deepEqual(proposedPolicy.cooldownProviderNames, ["cdn-a"]);
});
