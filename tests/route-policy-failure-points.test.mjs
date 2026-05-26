import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import worker from "../src/worker.js";
import { resetHealthState } from "../src/routing/health.js";

beforeEach(() => {
    resetHealthState();
});

function makeEnv() {
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
                return {
                    async fetch() {
                        return Response.json({ ok: true });
                    }
                };
            }
        }
    };
}

function request(path) {
    return new Request("https://edge.example.com" + path);
}

for (const statusCode of [403, 404, 429, 500]) {
    test("route policy fails over after HTTP " + statusCode, async () => {
        const oldFetch = globalThis.fetch;
        const urls = [];

        globalThis.fetch = async function(providerRequest) {
            urls.push(providerRequest.url);

            if (providerRequest.url.includes("cdn-a")) {
                return new Response("blocked", { status: statusCode });
            }

            return new Response("ok from fallback", { status: 200 });
        };

        try {
            const response = await worker.fetch(request("/video/status-" + statusCode + "/v1/chunk-0001.m4s"), makeEnv(), {});
            const body = await response.text();

            assert.equal(response.status, 200);
            assert.equal(body, "ok from fallback");
            assert.equal(response.headers.get("x-flareless-provider"), "cdn-b");
            assert.equal(response.headers.get("x-flareless-reason"), "PROVIDER_BLOCKED_FAILOVER");
            assert.equal(response.headers.get("x-flareless-attempts"), "cdn-a:PROVIDER_BLOCKED_" + statusCode + ",cdn-b:PROVIDER_SUCCESS");
            assert.ok(urls.some(url => url.includes("cdn-a.example.com")));
            assert.ok(urls.some(url => url.includes("cdn-b.example.com")));
        } finally {
            globalThis.fetch = oldFetch;
        }
    });
}

test("failure point header records provider failures and peer fallback selection", async () => {
    const oldFetch = globalThis.fetch;

    globalThis.fetch = async function() {
        return new Response("unavailable", { status: 503 });
    };

    try {
        const response = await worker.fetch(request("/video/failure-points/v1/chunk-0001.m4s"), makeEnv(), {});
        const body = await response.json();
        const failurePoints = response.headers.get("x-flareless-failure-points") || "";

        assert.equal(response.status, 503);
        assert.equal(body.protocol, "mgp-peer-fallback-v1");
        assert.match(failurePoints, /1:PROVIDER_BLOCKED_STATUS:cdn-a:PROVIDER_BLOCKED_503/);
        assert.match(failurePoints, /2:PROVIDER_BLOCKED_STATUS:cdn-b:PROVIDER_BLOCKED_503/);
        assert.match(failurePoints, /3:PROVIDER_BLOCKED_STATUS:cdn-c:PROVIDER_BLOCKED_503/);
        assert.match(failurePoints, /4:PEER_FALLBACK_DECISION:PEER_FALLBACK_SELECTED/);
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("failure point header records origin fallback selection", async () => {
    const oldFetch = globalThis.fetch;

    globalThis.fetch = async function() {
        return new Response("unavailable", { status: 503 });
    };

    try {
        const response = await worker.fetch(request("/origin-allowed/failure-points.bin"), makeEnv(), {});
        const body = await response.json();
        const failurePoints = response.headers.get("x-flareless-failure-points") || "";

        assert.equal(response.status, 200);
        assert.equal(body.protocol, "mgp-origin-fallback-v1");
        assert.match(failurePoints, /ORIGIN_FALLBACK_DECISION:ORIGIN_FALLBACK_SELECTED/);
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("failure point header records policy blocked fallback", async () => {
    const oldFetch = globalThis.fetch;

    globalThis.fetch = async function() {
        return new Response("unavailable", { status: 503 });
    };

    try {
        const response = await worker.fetch(request("/private/failure-points.bin"), makeEnv(), {});
        const body = await response.json();
        const failurePoints = response.headers.get("x-flareless-failure-points") || "";

        assert.equal(response.status, 503);
        assert.equal(body.protocol, "mgp-route-policy-v1");
        assert.equal(body.status, "fallback-blocked-by-policy");
        assert.match(failurePoints, /POLICY_BLOCKED_FALLBACK:FALLBACK_BLOCKED_BY_POLICY/);
    } finally {
        globalThis.fetch = oldFetch;
    }
});
