import { MgpAdaptivePeerScheduler } from "../public/mgpAdaptivePeerScheduler.js";

const args = parseArgs(process.argv.slice(2));
const config = {
    users: numberArg(args.users, 250),
    segments: numberArg(args.segments, 120),
    requests: numberArg(args.requests, 5000),
    peerCacheSize: numberArg(args.peerCacheSize, 32),
    peerShareRate: numberArg(args.peerShareRate, 0.72),
    cdnAFailureRate: numberArg(args.cdnAFailureRate, 0.04),
    cdnBFailureRate: numberArg(args.cdnBFailureRate, 0.02),
    cdnCFailureRate: numberArg(args.cdnCFailureRate, 0.01),
    cdnABlocked: booleanArg(args.cdnABlocked, false),
    cdnBBlocked: booleanArg(args.cdnBBlocked, false),
    cdnCBlocked: booleanArg(args.cdnCBlocked, false),
    peerFailureRate: numberArg(args.peerFailureRate, 0.03),
    invalidPeerRate: numberArg(args.invalidPeerRate, 0.002),
    seed: numberArg(args.seed, 1337),
    maxPeersPerChunk: numberArg(args.maxPeersPerChunk, 8)
};

const rng = mulberry32(config.seed);
const scheduler = new MgpAdaptivePeerScheduler({
    maxPeersPerChunk: config.maxPeersPerChunk,
    defaultRangeSizeBytes: 256 * 1024,
    minRangeSizeBytes: 64 * 1024,
    maxRangeSizeBytes: 512 * 1024,
    maxInFlightPerPeer: 2,
    cooldownMs: 15000
});

const cdns = [
    createCdn("cdn-a", 1, config.cdnAFailureRate, config.cdnABlocked, 55, 1.0),
    createCdn("cdn-b", 2, config.cdnBFailureRate, config.cdnBBlocked, 85, 0.8),
    createCdn("cdn-c", 3, config.cdnCFailureRate, config.cdnCBlocked, 115, 0.6)
];

const users = createUsers(config.users, rng);
const segments = createSegments(config.segments, rng);
const peerIndex = new Map();
const stats = {
    requests: 0,
    cdnHits: 0,
    peerHits: 0,
    cdnFailures: 0,
    peerFailures: 0,
    invalidPeerResponses: 0,
    totalLatencyMs: 0,
    totalCdnLatencyMs: 0,
    totalPeerLatencyMs: 0,
    peerFallbacks: 0,
    fullFailures: 0,
    cdnUse: new Map(),
    peerBytes: 0,
    cdnBytes: 0
};

for (const user of users) {
    warmInitialCache(user, segments, peerIndex, rng, config.peerCacheSize, config.peerShareRate);
}

for (let i = 0; i < config.requests; i += 1) {
    const user = users[Math.floor(rng() * users.length)];
    const segment = selectSegment(segments, rng);
    simulateRequest(user, segment);
}

printReport(config, cdns, stats, scheduler);

function simulateRequest(user, segment) {
    stats.requests += 1;

    if (user.cache.has(segment.id)) {
        stats.peerHits += 1;
        stats.totalLatencyMs += 2;
        stats.totalPeerLatencyMs += 2;
        return;
    }

    const cdnResult = tryCdn(segment);

    if (cdnResult.ok === true) {
        userRemember(user, segment);
        stats.cdnHits += 1;
        stats.cdnBytes += segment.byteLength;
        stats.totalLatencyMs += cdnResult.latencyMs;
        stats.totalCdnLatencyMs += cdnResult.latencyMs;
        increment(stats.cdnUse, cdnResult.cdn.name);
        maybeAnnouncePeer(user, segment);
        return;
    }

    stats.cdnFailures += 1;
    stats.peerFallbacks += 1;

    const peerResult = tryPeers(user, segment);

    if (peerResult.ok === true) {
        userRemember(user, segment);
        stats.peerHits += 1;
        stats.peerBytes += segment.byteLength;
        stats.totalLatencyMs += peerResult.latencyMs;
        stats.totalPeerLatencyMs += peerResult.latencyMs;
        maybeAnnouncePeer(user, segment);
        return;
    }

    stats.peerFailures += 1;
    stats.fullFailures += 1;
    stats.totalLatencyMs += cdnResult.latencyMs + peerResult.latencyMs;
}

function tryCdn(segment) {
    let accumulatedLatency = 0;

    const ranked = cdns
        .filter(cdn => cdn.enabled === true)
        .sort((left, right) => scoreCdn(left) - scoreCdn(right));

    for (const cdn of ranked) {
        const latency = jitter(cdn.baseLatencyMs, 30, rng);
        accumulatedLatency += latency;

        if (cdn.blocked === true || rng() < cdn.failureRate) {
            cdn.failures += 1;
            continue;
        }

        cdn.successes += 1;
        cdn.totalLatencyMs += latency;
        cdn.avgLatencyMs = cdn.totalLatencyMs / cdn.successes;
        return {
            ok: true,
            cdn: cdn,
            latencyMs: accumulatedLatency
        };
    }

    return {
        ok: false,
        latencyMs: accumulatedLatency
    };
}

function tryPeers(user, segment) {
    const holders = peerIndex.get(segment.id) || [];
    const protocols = holders
        .filter(peer => peer.id !== user.id)
        .map(peer => createSimulatedProtocol(peer, segment));

    if (protocols.length === 0) {
        return {
            ok: false,
            latencyMs: 0
        };
    }

    const selected = scheduler.selectPeers(protocols, {
        bufferedAheadSeconds: user.bufferedAheadSeconds,
        peerProtocols: protocols
    });

    if (selected.length === 0) {
        return {
            ok: false,
            latencyMs: 0
        };
    }

    const rangeSize = scheduler.chooseRangeSize({
        bufferedAheadSeconds: user.bufferedAheadSeconds,
        peerProtocols: protocols
    });
    const rangeCount = Math.max(1, Math.ceil(segment.byteLength / rangeSize));
    const workers = Math.min(rangeCount, selected.length);
    let maxLatency = 0;

    for (let i = 0; i < workers; i += 1) {
        const peerState = selected[i % selected.length];
        const startedAt = Date.now() - Math.floor(jitter(60, 40, rng));
        scheduler.beginRange(peerState);

        if (rng() < config.invalidPeerRate) {
            scheduler.failRange(peerState, new Error("range-hash-verification-failed"));
            stats.invalidPeerResponses += 1;
            return {
                ok: false,
                latencyMs: maxLatency + 50
            };
        }

        if (rng() < config.peerFailureRate) {
            scheduler.failRange(peerState, new Error("peer-timeout"));
            return {
                ok: false,
                latencyMs: maxLatency + 100
            };
        }

        const peerLatency = Math.max(8, jitter(peerState.protocol.latencyMs, 35, rng));
        maxLatency = Math.max(maxLatency, peerLatency);
        scheduler.completeRange(peerState, Math.min(rangeSize, segment.byteLength), startedAt);
    }

    return {
        ok: true,
        latencyMs: maxLatency
    };
}

function createSimulatedProtocol(peer, segment) {
    return {
        remotePeerId: peer.id,
        latencyMs: peer.basePeerLatencyMs,
        segmentId: segment.id
    };
}

function maybeAnnouncePeer(user, segment) {
    if (rng() > config.peerShareRate) {
        return;
    }

    let holders = peerIndex.get(segment.id);

    if (holders === undefined) {
        holders = [];
        peerIndex.set(segment.id, holders);
    }

    if (holders.some(peer => peer.id === user.id) === false) {
        holders.push(user);
    }
}

function userRemember(user, segment) {
    if (user.cache.size >= config.peerCacheSize) {
        const first = user.cache.values().next().value;
        user.cache.delete(first);
    }

    user.cache.add(segment.id);
}

function warmInitialCache(user, segments, peerIndex, rng, cacheSize, shareRate) {
    const count = Math.max(1, Math.floor(cacheSize * rng()));

    for (let i = 0; i < count; i += 1) {
        const segment = segments[Math.floor(rng() * segments.length)];
        user.cache.add(segment.id);

        if (rng() < shareRate) {
            let holders = peerIndex.get(segment.id);

            if (holders === undefined) {
                holders = [];
                peerIndex.set(segment.id, holders);
            }

            holders.push(user);
        }
    }
}

function scoreCdn(cdn) {
    const priorityScore = cdn.priority * 100;
    const costScore = cdn.costWeight * 25;
    const failurePenalty = cdn.failures * 20;
    const latencyPenalty = cdn.avgLatencyMs || cdn.baseLatencyMs;
    const blockPenalty = cdn.blocked ? 100000 : 0;
    const successBonus = Math.min(cdn.successes, 100);
    return priorityScore + costScore + failurePenalty + latencyPenalty + blockPenalty - successBonus;
}

function createCdn(name, priority, failureRate, blocked, baseLatencyMs, costWeight) {
    return {
        name,
        priority,
        failureRate,
        blocked,
        baseLatencyMs,
        costWeight,
        enabled: true,
        successes: 0,
        failures: 0,
        totalLatencyMs: 0,
        avgLatencyMs: 0
    };
}

function createUsers(count, rng) {
    const output = [];

    for (let i = 0; i < count; i += 1) {
        output.push({
            id: "peer-" + i,
            cache: new Set(),
            bufferedAheadSeconds: Math.floor(4 + rng() * 30),
            basePeerLatencyMs: Math.floor(20 + rng() * 120)
        });
    }

    return output;
}

function createSegments(count, rng) {
    const output = [];

    for (let i = 0; i < count; i += 1) {
        output.push({
            id: "seg-" + String(i).padStart(5, "0"),
            byteLength: Math.floor((256 + rng() * 1536) * 1024),
            popularity: 1 / Math.pow(i + 1, 0.85)
        });
    }

    const total = output.reduce((sum, segment) => sum + segment.popularity, 0);

    for (const segment of output) {
        segment.normalizedPopularity = segment.popularity / total;
    }

    return output;
}

function selectSegment(segments, rng) {
    const value = rng();
    let running = 0;

    for (const segment of segments) {
        running += segment.normalizedPopularity;

        if (value <= running) {
            return segment;
        }
    }

    return segments[segments.length - 1];
}

function printReport(config, cdns, stats, scheduler) {
    const peerHitRate = percent(stats.peerHits / stats.requests);
    const cdnHitRate = percent(stats.cdnHits / stats.requests);
    const failureRate = percent(stats.fullFailures / stats.requests);
    const avgLatency = stats.requests > 0 ? Math.round(stats.totalLatencyMs / stats.requests) : 0;
    const avgCdnLatency = stats.cdnHits > 0 ? Math.round(stats.totalCdnLatencyMs / stats.cdnHits) : 0;
    const avgPeerLatency = stats.peerHits > 0 ? Math.round(stats.totalPeerLatencyMs / stats.peerHits) : 0;

    console.log("Open Edge Router Network Simulation");
    console.log("==================================");
    console.log("Users: " + config.users);
    console.log("Segments: " + config.segments);
    console.log("Requests: " + config.requests);
    console.log("Peer share rate: " + percent(config.peerShareRate));
    console.log("");
    console.log("Results");
    console.log("-------");
    console.log("CDN hit rate: " + cdnHitRate);
    console.log("Peer hit rate: " + peerHitRate);
    console.log("Full failure rate: " + failureRate);
    console.log("Peer fallback attempts: " + stats.peerFallbacks);
    console.log("Invalid peer responses: " + stats.invalidPeerResponses);
    console.log("Average latency: " + avgLatency + " ms");
    console.log("Average CDN latency: " + avgCdnLatency + " ms");
    console.log("Average peer latency: " + avgPeerLatency + " ms");
    console.log("CDN bytes: " + formatBytes(stats.cdnBytes));
    console.log("Peer bytes: " + formatBytes(stats.peerBytes));
    console.log("");
    console.log("CDN Breakdown");
    console.log("-------------");

    for (const cdn of cdns) {
        console.log(cdn.name + ": successes=" + cdn.successes + " failures=" + cdn.failures + " blocked=" + cdn.blocked + " avgLatencyMs=" + Math.round(cdn.avgLatencyMs || 0));
    }

    console.log("");
    console.log("Top Peer Scheduler Snapshot");
    console.log("---------------------------");

    for (const peer of scheduler.snapshot().slice(0, 10)) {
        console.log(peer.key + ": successes=" + peer.successes + " failures=" + peer.failures + " invalid=" + peer.invalidRanges + " throughput=" + formatBytes(peer.avgThroughputBytesPerSecond) + "/s cooldownMs=" + peer.cooldownMsRemaining);
    }
}

function parseArgs(values) {
    const result = {};

    for (const value of values) {
        if (value.startsWith("--") === false) {
            continue;
        }

        const index = value.indexOf("=");

        if (index === -1) {
            result[value.slice(2)] = "true";
        } else {
            result[value.slice(2, index)] = value.slice(index + 1);
        }
    }

    return result;
}

function numberArg(value, fallback) {
    const parsed = Number(value);

    if (Number.isFinite(parsed) === true) {
        return parsed;
    }

    return fallback;
}

function booleanArg(value, fallback) {
    if (value === undefined) {
        return fallback;
    }

    return value === true || value === "true" || value === "1" || value === "yes";
}

function increment(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
}

function jitter(base, spread, rng) {
    return Math.max(1, Math.round(base + (rng() - 0.5) * spread));
}

function percent(value) {
    return (value * 100).toFixed(2) + "%";
}

function formatBytes(value) {
    if (value >= 1024 * 1024 * 1024) {
        return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }

    if (value >= 1024 * 1024) {
        return (value / (1024 * 1024)).toFixed(2) + " MB";
    }

    if (value >= 1024) {
        return (value / 1024).toFixed(2) + " KB";
    }

    return value + " B";
}

function mulberry32(seed) {
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
