import assert from "node:assert/strict";
import test from "node:test";

import worker, { MgpSignalRoom } from "../src/worker.js";
import { fetchThroughProvider } from "../src/routing/providerFetch.js";

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
        }
    };
}

function jsonRequest(path) {
    return new Request("https://edge.example.com" + path);
}

test("worker exports default fetch and Durable Object class", () => {
    assert.equal(typeof worker.fetch, "function");
    assert.equal(typeof MgpSignalRoom, "function");
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

test("all providers failing returns structured peer fallback", async () => {
    const oldFetch = globalThis.fetch;
    const urls = [];

    globalThis.fetch = async function(request) {
        urls.push(request.url);
        return new Response("unavailable", { status: 503 });
    };

    try {
        const response = await worker.fetch(jsonRequest("/video/c.m4s"), makeEnv(), {});
        const body = await response.json();

        assert.equal(response.status, 503);
        assert.equal(body.protocol, "mgp-peer-fallback-v1");
        assert.equal(body.status, "cdn-routes-unavailable");
        assert.deepEqual(body.providersTried, ["cdn-a", "cdn-b", "cdn-c"]);
        assert.equal(urls.length, 3);
    } finally {
        globalThis.fetch = oldFetch;
    }
});
