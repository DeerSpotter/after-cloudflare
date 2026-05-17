import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { PROVIDERS } from "../src/config/providers.js";
import { getLayeredHealthSnapshot, markProviderFailure, resetHealthState } from "../src/routing/health.js";
import { selectProviders } from "../src/routing/selector.js";

beforeEach(() => {
    resetHealthState();
});

test("route scoped health failure does not poison unrelated routes", () => {
    markProviderFailure("route:/video/show-a/v1", "cdn-a", "blocked-451");
    markProviderFailure("route:/video/show-a/v1", "cdn-a", "blocked-451");

    const failedRouteRanked = selectProviders(PROVIDERS, getLayeredHealthSnapshot([
        { scopeKey: "global", weight: 0.1 },
        { scopeKey: "route:/video/show-a/v1", weight: 1 },
        { scopeKey: "chunk:/video/show-a/v1/chunk-0001.m4s", weight: 2 }
    ]));

    const unrelatedRouteRanked = selectProviders(PROVIDERS, getLayeredHealthSnapshot([
        { scopeKey: "global", weight: 0.1 },
        { scopeKey: "route:/assets", weight: 1 },
        { scopeKey: "chunk:/assets/logo.png", weight: 2 }
    ]));

    assert.equal(failedRouteRanked[0].name, "cdn-b");
    assert.equal(unrelatedRouteRanked[0].name, "cdn-a");
});

test("chunk scoped health failure does not poison sibling chunks", () => {
    markProviderFailure("chunk:/video/show-a/v1/chunk-0001.m4s", "cdn-a", "blocked-451");
    markProviderFailure("chunk:/video/show-a/v1/chunk-0001.m4s", "cdn-a", "blocked-451");

    const failedChunkRanked = selectProviders(PROVIDERS, getLayeredHealthSnapshot([
        { scopeKey: "global", weight: 0.1 },
        { scopeKey: "chunk:/video/show-a/v1/chunk-0001.m4s", weight: 2 }
    ]));

    const siblingChunkRanked = selectProviders(PROVIDERS, getLayeredHealthSnapshot([
        { scopeKey: "global", weight: 0.1 },
        { scopeKey: "chunk:/video/show-a/v1/chunk-0002.m4s", weight: 2 }
    ]));

    assert.equal(failedChunkRanked[0].name, "cdn-b");
    assert.equal(siblingChunkRanked[0].name, "cdn-a");
});
