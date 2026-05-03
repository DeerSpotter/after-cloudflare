import assert from "node:assert/strict";
import test from "node:test";

import { MgpAdaptivePeerScheduler, MgpUploadLimiter, peerKey } from "../public/mgpAdaptivePeerScheduler.js";

test("peerKey prefers remotePeerId then peerId", () => {
    assert.equal(peerKey({ remotePeerId: "remote-a", peerId: "local-a" }), "remote-a");
    assert.equal(peerKey({ peerId: "local-a" }), "local-a");
});

test("scheduler prefers higher throughput peer", () => {
    const scheduler = new MgpAdaptivePeerScheduler({ maxPeersPerChunk: 2 });
    const slow = { remotePeerId: "slow" };
    const fast = { remotePeerId: "fast" };

    scheduler.ensurePeer(slow).avgThroughputBytesPerSecond = 100000;
    scheduler.ensurePeer(fast).avgThroughputBytesPerSecond = 1000000;

    assert.equal(scheduler.selectPeers([slow, fast], {})[0].key, "fast");
});

test("scheduler skips peer at in flight limit", () => {
    const scheduler = new MgpAdaptivePeerScheduler({ maxInFlightPerPeer: 1 });
    const peer = { remotePeerId: "busy" };
    const state = scheduler.ensurePeer(peer);

    state.inFlight = 1;

    assert.equal(scheduler.selectPeers([peer], {}).length, 0);
});

test("hash failure penalizes and cools down peer", () => {
    const scheduler = new MgpAdaptivePeerScheduler({ cooldownMs: 5000 });
    const peer = { remotePeerId: "bad" };
    const state = scheduler.ensurePeer(peer);

    scheduler.beginRange(state);
    scheduler.failRange(state, new Error("range-hash-verification-failed"));

    assert.equal(state.invalidRanges, 1);
    assert.ok(state.cooldownUntil > Date.now());
    assert.equal(scheduler.selectPeers([peer], {}).length, 0);
});

test("three normal failures cool down peer", () => {
    const scheduler = new MgpAdaptivePeerScheduler({ cooldownMs: 5000 });
    const peer = { remotePeerId: "flaky" };
    const state = scheduler.ensurePeer(peer);

    scheduler.failRange(state, new Error("timeout"));
    scheduler.failRange(state, new Error("timeout"));
    scheduler.failRange(state, new Error("timeout"));

    assert.ok(state.cooldownUntil > Date.now());
});

test("completeRange records throughput and clears in flight", () => {
    const scheduler = new MgpAdaptivePeerScheduler({});
    const state = scheduler.ensurePeer({ remotePeerId: "good" });

    scheduler.beginRange(state);
    scheduler.completeRange(state, 256 * 1024, Date.now() - 100);

    assert.equal(state.inFlight, 0);
    assert.equal(state.successes, 1);
    assert.ok(state.avgThroughputBytesPerSecond > 0);
});

test("chooseRangeSize clamps to configured maximum", () => {
    const scheduler = new MgpAdaptivePeerScheduler({
        minRangeSizeBytes: 64 * 1024,
        maxRangeSizeBytes: 512 * 1024,
        targetRangeMs: 900
    });
    const peer = { remotePeerId: "fast" };

    scheduler.ensurePeer(peer).avgThroughputBytesPerSecond = 10000000;

    assert.equal(scheduler.chooseRangeSize({ peerProtocols: [peer] }), 512 * 1024);
});

test("upload limiter rejects when queue is full", async () => {
    const limiter = new MgpUploadLimiter({ maxConcurrentUploads: 1, maxQueuedUploads: 1 });
    let releaseFirst;

    const first = limiter.run(() => new Promise(resolve => {
        releaseFirst = resolve;
    }));
    const second = limiter.run(() => "second");

    await assert.rejects(() => limiter.run(() => "third"), /upload-queue-full/);

    releaseFirst("first");

    assert.equal(await first, "first");
    assert.equal(await second, "second");
});
