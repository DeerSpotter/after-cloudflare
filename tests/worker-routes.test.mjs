import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import worker, { MgpSignalRoom, DemoPresenceRoom } from "../src/worker.js";
import { fetchThroughProvider } from "../src/routing/providerFetch.js";
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

function jsonRequest(path) {
    return new Request("https://edge.example.com" + path);
}

test("worker exports default fetch and Durable Object classes", () => {
    assert.equal(typeof worker.fetch, "function");
    assert.equal(typeof MgpSignalRoom, "function");
    assert.equal(typeof DemoPresenceRoom, "function");
});

test("/demo/presence records real active viewer heartbeat", async () => {
    const env = makeEnv();
    const response = await worker.fetch(new Request("https://edge.example.com/demo/presence", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify({
            sessionId: "viewer-1",
            label: "Phone viewer",
            route: "Timeout failover"
        })
    }), env, {});
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.protocol, "flareless-demo-presence-v1");
    assert.equal(body.viewerCount, 1);
    assert.equal(body.viewers[0].sessionId, "viewer-1");
    assert.equal(body.viewers[0].label, "Phone viewer");
    assert.equal(body.viewers[0].route, "Timeout failover");
});

test("/demo/presence returns shared viewer count", async () => {
    const env = makeEnv();

    await worker.fetch(new Request("https://edge.example.com/demo/presence", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify({
            sessionId: "viewer-1",
            label: "Phone viewer",
            route: "Normal route"
        })
    }), env, {});

    await worker.fetch(new Request("https://edge.example.com/demo/presence", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify({
            sessionId: "viewer-2",
            label: "Desktop viewer",
            route: "HTTP 403 failover"
        })
    }), env, {});

    const response = await worker.fetch(jsonRequest("/demo/presence"), env, {});
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.viewerCount, 2);
    assert.equal(body.viewers.length, 2);
});

test("/health returns provider snapshot", async () => {
    const response = await worker.fetch(jsonRequest("/health"), makeEnv(), {});
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.protocol, "mgp-edge");
    assert.equal(body.providers.length, 3);
});

test("/manifest normalizes path and generates provider URLs", async () => {
    const response = await worker.fetch(jsonRequest("/manifest?path=video/test/v1/seg_00001.m4s"), makeEnv(), {});
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.protocol, "mgp-manifest-v1");
    assert.equal(body.assetPath, "/video/test/v1/seg_00001.m4s");
    assert.equal(body.sources.length, 3);
    assert.equal(body.sources[0].url, "https://cdn-a.example.com/video/test/v1/seg_00001.m4s");
});

test("/peer/room-info is stable and sanitizes room parts", async () => {
    const url = "/peer/room-info?asset=Show 1!&region=US&peerId=Peer A";
    const first = await worker.fetch(jsonRequest(url), makeEnv(), {});
    const second = await worker.fetch(jsonRequest(url), makeEnv(), {});
    const firstBody = await first.json();
    const secondBody = await second.json();

    assert.equal(firstBody.assetId, "show_1_");
    assert.equal(firstBody.region, "us");
    assert.equal(firstBody.peerId, "peer_a");
    assert.equal(firstBody.roomName, secondBody.roomName);
});

test("/peer/ws routes through Durable Object binding", async () => {
    const response = await worker.fetch(jsonRequest("/peer/ws?asset=test&peerId=a"), makeEnv(), {});
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.match(text, /stub websocket room/);
});

test("successful CDN route returns provider headers", async () => {
    const oldFetch = globalThis.fetch;

    globalThis.fetch = async function(request) {
        return new Response("ok from cdn", { status: 200 });
    };

    try {
        const response = await worker.fetch(jsonRequest("/video/a.m4s"), makeEnv(), {});
        const text = await response.text();

        assert.equal(response.status, 200);
        assert.equal(text, "ok from cdn");
        assert.equal(response.headers.get("x-open-edge-provider"), "cdn-a");
        assert.ok(response.headers.get("x-mgp-route-id"));
        assert.equal(response.headers.get("x-flareless-provider"), "cdn-a");
        assert.equal(response.headers.get("x-flareless-policy-id"), "video-public-peer-first");
        assert.equal(response.headers.get("x-flareless-route-key"), "route:/video");
        assert.ok(response.headers.get("x-flareless-request-id"));
        assert.equal(response.headers.get("x-flareless-reason"), "PRIMARY_PROVIDER_SUCCESS");
        assert.equal(response.headers.get("x-flareless-attempts"), "cdn-a:PROVIDER_SUCCESS");
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("blocked first provider falls through to second provider with route explanation", async () => {
    const oldFetch = globalThis.fetch;
    const urls = [];

    globalThis.fetch = async function(request) {
        urls.push(request.url);

        if (request.url.includes("cdn-a")) {
            return new Response("blocked", { status: 451 });
        }

        return new Response("ok from fallback", { status: 200 });
    };

    try {
        const response = await worker.fetch(jsonRequest("/video/b.m4s"), makeEnv(), {});
        const text = await response.text();

        assert.equal(response.status, 200);
        assert.equal(text, "ok from fallback");
        assert.equal(response.headers.get("x-open-edge-provider"), "cdn-b");
        assert.equal(response.headers.get("x-flareless-provider"), "cdn-b");
        assert.equal(response.headers.get("x-flareless-reason"), "PROVIDER_BLOCKED_FAILOVER");
        assert.equal(response.headers.get("x-flareless-attempts"), "cdn-a:PROVIDER_BLOCKED_451,cdn-b:PROVIDER_SUCCESS");
        assert.ok(urls.some(url => url.includes("cdn-a.example.com")));
        assert.ok(urls.some(url => url.includes("cdn-b.example.com")));
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("route scoped health keeps unrelated routes on primary provider", async () => {
    const oldFetch = globalThis.fetch;
    const firstRouteUrls = [];
    const sameRouteUrls = [];
    const unrelatedRouteUrls = [];
    let phase = "first-route";

    globalThis.fetch = async function(request) {
        if (phase === "first-route") {
            firstRouteUrls.push(request.url);
        }

        if (phase === "same-route") {
            sameRouteUrls.push(request.url);
        }

        if (phase === "unrelated-route") {
            unrelatedRouteUrls.push(request.url);
        }

        if (request.url.includes("cdn-a") && request.url.includes("/video/show-a/v1/")) {
            return new Response("blocked", { status: 451 });
        }

        return new Response("ok", { status: 200 });
    };

    try {
        const firstRouteResponse = await worker.fetch(jsonRequest("/video/show-a/v1/chunk-0001.m4s"), makeEnv(), {});
        await firstRouteResponse.text();

        assert.equal(firstRouteResponse.headers.get("x-flareless-provider"), "cdn-b");
        assert.equal(firstRouteResponse.headers.get("x-flareless-route-key"), "route:/video/show-a/v1");
        assert.equal(firstRouteUrls[0], "https://cdn-a.example.com/video/show-a/v1/chunk-0001.m4s");
        assert.equal(firstRouteUrls[1], "https://cdn-b.example.com/video/show-a/v1/chunk-0001.m4s");

        phase = "same-route";

        const sameRouteResponse = await worker.fetch(jsonRequest("/video/show-a/v1/chunk-0002.m4s"), makeEnv(), {});
        await sameRouteResponse.text();

        assert.equal(sameRouteResponse.headers.get("x-flareless-provider"), "cdn-b");
        assert.equal(sameRouteResponse.headers.get("x-flareless-route-key"), "route:/video/show-a/v1");
        assert.equal(sameRouteUrls[0], "https://cdn-b.example.com/video/show-a/v1/chunk-0002.m4s");

        phase = "unrelated-route";

        const unrelatedRouteResponse = await worker.fetch(jsonRequest("/assets/logo.png"), makeEnv(), {});
        await unrelatedRouteResponse.text();

        assert.equal(unrelatedRouteResponse.headers.get("x-flareless-provider"), "cdn-a");
        assert.equal(unrelatedRouteResponse.headers.get("x-flareless-route-key"), "route:/assets");
        assert.equal(unrelatedRouteUrls[0], "https://cdn-a.example.com/assets/logo.png");
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("video route policy allows peer fallback after all providers fail", async () => {
    const oldFetch = globalThis.fetch;

    globalThis.fetch = async function() {
        return new Response("unavailable", { status: 503 });
    };

    try {
        const response = await worker.fetch(jsonRequest("/video/policy-test/v1/chunk-0001.m4s"), makeEnv(), {});
        const body = await response.json();

        assert.equal(response.status, 503);
        assert.equal(response.headers.get("x-flareless-route"), "peer-fallback");
        assert.equal(response.headers.get("x-flareless-policy-id"), "video-public-peer-first");
        assert.equal(body.protocol, "mgp-peer-fallback-v1");
        assert.equal(body.routePolicyId, "video-public-peer-first");
        assert.equal(body.routeKey, "route:/video/policy-test/v1");
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("origin allowed route policy returns origin fallback when providers fail", async () => {
    const oldFetch = globalThis.fetch;

    globalThis.fetch = async function() {
        return new Response("unavailable", { status: 503 });
    };

    try {
        const response = await worker.fetch(jsonRequest("/origin-allowed/file.bin"), makeEnv(), {});
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(response.headers.get("x-flareless-route"), "origin-fallback");
        assert.equal(response.headers.get("x-flareless-policy-id"), "origin-fallback-allowed");
        assert.equal(body.protocol, "mgp-origin-fallback-v1");
        assert.equal(body.routePolicyId, "origin-fallback-allowed");
        assert.equal(body.routeKey, "route:/origin-allowed");
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("private route policy blocks peer and origin fallback", async () => {
    const oldFetch = globalThis.fetch;

    globalThis.fetch = async function() {
        return new Response("unavailable", { status: 503 });
    };

    try {
        const response = await worker.fetch(jsonRequest("/private/locked.bin"), makeEnv(), {});
        const body = await response.json();

        assert.equal(response.status, 503);
        assert.equal(response.headers.get("x-flareless-route"), "fallback-blocked");
        assert.equal(response.headers.get("x-flareless-policy-id"), "private-no-fallback");
        assert.equal(body.protocol, "mgp-route-policy-v1");
        assert.equal(body.status, "fallback-blocked-by-policy");
        assert.equal(body.allowPeerFallback, false);
        assert.equal(body.allowOriginFallback, false);
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("provider fetch returns timeout result when provider does not answer before timeout", async () => {
    const oldFetch = globalThis.fetch;

    globalThis.fetch = async function() {
        return new Promise(() => {});
    };

    try {
        const result = await fetchThroughProvider(jsonRequest("/video/slow.m4s"), {
            name: "slow-cdn",
            baseUrl: "https://slow.example.com",
            timeoutMs: 10
        });

        assert.equal(result.ok, false);
        assert.equal(result.provider, "slow-cdn");
        assert.equal(result.reason, "PROVIDER_TIMEOUT");
        assert.equal(result.timeoutMs, 10);
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("provider fetch aborts the underlying request after timeout", async () => {
    const oldFetch = globalThis.fetch;
    let capturedSignal = null;

    globalThis.fetch = async function(request) {
        capturedSignal = request.signal;
        return new Promise(() => {});
    };

    try {
        const result = await fetchThroughProvider(jsonRequest("/video/abort.m4s"), {
            name: "slow-cdn",
            baseUrl: "https://slow.example.com",
            timeoutMs: 10
        });

        assert.equal(result.ok, false);
        assert.equal(result.reason, "PROVIDER_TIMEOUT");
        assert.notEqual(capturedSignal, null);
        assert.equal(capturedSignal.aborted, true);
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("provider fetch does not forward unsafe request headers", async () => {
    const oldFetch = globalThis.fetch;
    let capturedHeaders = null;

    globalThis.fetch = async function(request) {
        capturedHeaders = request.headers;
        return new Response("ok", { status: 200 });
    };

    try {
        const request = new Request("https://edge.example.com/video/header-test.m4s", {
            headers: {
                "accept": "video/mp4",
                "range": "bytes=0-1023",
                "authorization": "Bearer secret-token",
                "cookie": "session=secret-cookie",
                "x-internal-user-id": "user-123"
            }
        });

        const result = await fetchThroughProvider(request, {
            name: "cdn-a",
            baseUrl: "https://cdn-a.example.com",
            timeoutMs: 1000
        });

        assert.equal(result.ok, true);
        assert.equal(capturedHeaders.get("accept"), "video/mp4");
        assert.equal(capturedHeaders.get("range"), "bytes=0-1023");
        assert.equal(capturedHeaders.get("x-open-edge-source-host"), "edge.example.com");
        assert.equal(capturedHeaders.get("x-open-edge-provider"), "cdn-a");
        assert.equal(capturedHeaders.has("authorization"), false);
        assert.equal(capturedHeaders.has("cookie"), false);
        assert.equal(capturedHeaders.has("x-internal-user-id"), false);
    } finally {
        globalThis.fetch = oldFetch;
    }
});

test("all providers failing returns structured peer fallback", async () => {
    const oldFetch = globalThis.fetch;
    const urls = [];

    globalThis.fetch = async function(request) {
        urls.push(request.url);
        return new Response("unavailable", { status: 503 });
    };

    try {
        const response = await worker.fetch(jsonRequest("/video/c.m4s"), makeEnv(), {});

        assert.equal(response.status, 503);
        assert.match(response.headers.get("content-type") || "", /application\/json/);

        const body = await response.json();

        assert.equal(body.protocol, "mgp-peer-fallback-v1");
        assert.equal(body.status, "cdn-routes-unavailable");
        assert.deepEqual(body.providersTried, ["cdn-a", "cdn-b", "cdn-c"]);
        assert.equal(urls.length, 3);
    } finally {
        globalThis.fetch = oldFetch;
    }
});
