import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import worker, { DemoPresenceRoom, MgpSignalRoom } from "../src/worker.js";
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

test("local integration route records timeout, 429, final provider success, and failure points", async () => {
    const oldFetch = globalThis.fetch;
    const providerUrls = [];

    globalThis.fetch = async function(request) {
        providerUrls.push(request.url);

        if (request.url.includes("cdn-a.example.com")) {
            return new Promise(() => {});
        }

        if (request.url.includes("cdn-b.example.com")) {
            return new Response("rate limited", { status: 429 });
        }

        if (request.url.includes("cdn-c.example.com")) {
            return new Response("ok from cdn-c", { status: 200 });
        }

        return new Response("unexpected provider", { status: 500 });
    };

    try {
        const response = await worker.fetch(edgeRequest("/video/integration/v1/chunk-0001.m4s"), makeEnv(), {});
        const body = await response.text();
        const failurePoints = response.headers.get("x-flareless-failure-points") || "";

        assert.equal(response.status, 200);
        assert.equal(body, "ok from cdn-c");
        assert.deepEqual(providerUrls, [
            "https://cdn-a.example.com/video/integration/v1/chunk-0001.m4s",
            "https://cdn-b.example.com/video/integration/v1/chunk-0001.m4s",
            "https://cdn-c.example.com/video/integration/v1/chunk-0001.m4s"
        ]);
        assert.equal(response.headers.get("x-flareless-provider"), "cdn-c");
        assert.equal(response.headers.get("x-flareless-route-key"), "route:/video/integration/v1");
        assert.equal(response.headers.get("x-flareless-policy-id"), "video-public-peer-first");
        assert.equal(response.headers.get("x-flareless-reason"), "PROVIDER_TIMEOUT_FAILOVER");
        assert.equal(response.headers.get("x-flareless-attempts"), "cdn-a:PROVIDER_TIMEOUT,cdn-b:PROVIDER_BLOCKED_429,cdn-c:PROVIDER_SUCCESS");
        assert.match(failurePoints, /1:PROVIDER_TIMEOUT:cdn-a:PROVIDER_TIMEOUT/);
        assert.match(failurePoints, /2:PROVIDER_BLOCKED_STATUS:cdn-b:PROVIDER_BLOCKED_429/);
    } finally {
        globalThis.fetch = oldFetch;
    }
});
