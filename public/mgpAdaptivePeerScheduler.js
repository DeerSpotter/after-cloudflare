export class MgpAdaptivePeerScheduler {
    constructor(options) {
        this.maxPeersPerChunk = options?.maxPeersPerChunk || 8;
        this.minPeersPerChunk = options?.minPeersPerChunk || 2;
        this.defaultRangeSizeBytes = options?.defaultRangeSizeBytes || 256 * 1024;
        this.minRangeSizeBytes = options?.minRangeSizeBytes || 64 * 1024;
        this.maxRangeSizeBytes = options?.maxRangeSizeBytes || 512 * 1024;
        this.targetRangeMs = options?.targetRangeMs || 900;
        this.maxInFlightPerPeer = options?.maxInFlightPerPeer || 2;
        this.cooldownMs = options?.cooldownMs || 15000;
        this.peers = new Map();
    }

    ensurePeer(protocol) {
        const key = peerKey(protocol);
        let state = this.peers.get(key);

        if (state === undefined) {
            state = {
                key: key,
                protocol: protocol,
                successes: 0,
                failures: 0,
                invalidRanges: 0,
                bytes: 0,
                inFlight: 0,
                lastLatencyMs: 0,
                avgLatencyMs: 0,
                avgThroughputBytesPerSecond: 0,
                cooldownUntil: 0,
                lastUsedAt: 0
            };
            this.peers.set(key, state);
        }

        state.protocol = protocol;
        return state;
    }

    updatePeers(peerProtocols) {
        for (const protocol of peerProtocols || []) {
            this.ensurePeer(protocol);
        }
    }

    selectPeers(peerProtocols, context) {
        this.updatePeers(peerProtocols);

        const now = Date.now();
        const candidates = [];

        for (const protocol of peerProtocols || []) {
            const state = this.ensurePeer(protocol);

            if (state.cooldownUntil > now) {
                continue;
            }

            if (state.inFlight >= this.maxInFlightPerPeer) {
                continue;
            }

            candidates.push(state);
        }

        candidates.sort((left, right) => this.scorePeer(right, context) - this.scorePeer(left, context));
        return candidates.slice(0, this.maxPeersPerChunk);
    }

    scorePeer(state, context) {
        const successScore = state.successes * 25;
        const failurePenalty = state.failures * 60;
        const invalidPenalty = state.invalidRanges * 250;
        const latencyPenalty = state.avgLatencyMs > 0 ? state.avgLatencyMs * 0.08 : 20;
        const throughputScore = state.avgThroughputBytesPerSecond > 0 ? Math.log2(state.avgThroughputBytesPerSecond) * 18 : 0;
        const congestionPenalty = state.inFlight * 75;
        const freshnessPenalty = state.lastUsedAt === 0 ? 0 : Math.min(20, (Date.now() - state.lastUsedAt) / 1000);
        const bufferBonus = context?.bufferedAheadSeconds >= 20 ? 20 : 0;

        return 1000 + successScore + throughputScore + bufferBonus + freshnessPenalty - failurePenalty - invalidPenalty - latencyPenalty - congestionPenalty;
    }

    chooseRangeSize(context) {
        const selected = this.selectPeers(context?.peerProtocols || [], context);

        if (selected.length === 0) {
            return this.defaultRangeSizeBytes;
        }

        const throughputValues = selected
            .map(peer => peer.avgThroughputBytesPerSecond)
            .filter(value => value > 0);

        if (throughputValues.length === 0) {
            return this.defaultRangeSizeBytes;
        }

        const avgThroughput = throughputValues.reduce((sum, value) => sum + value, 0) / throughputValues.length;
        const targetBytes = Math.floor(avgThroughput * (this.targetRangeMs / 1000));
        return clamp(targetBytes, this.minRangeSizeBytes, this.maxRangeSizeBytes);
    }

    beginRange(peerState) {
        peerState.inFlight += 1;
        peerState.lastUsedAt = Date.now();
    }

    completeRange(peerState, byteLength, startedAtMs) {
        const elapsedMs = Math.max(1, Date.now() - startedAtMs);
        const throughput = byteLength / (elapsedMs / 1000);

        peerState.inFlight = Math.max(0, peerState.inFlight - 1);
        peerState.successes += 1;
        peerState.bytes += byteLength;
        peerState.lastLatencyMs = elapsedMs;
        peerState.avgLatencyMs = movingAverage(peerState.avgLatencyMs, elapsedMs, 0.25);
        peerState.avgThroughputBytesPerSecond = movingAverage(peerState.avgThroughputBytesPerSecond, throughput, 0.25);
    }

    failRange(peerState, error) {
        peerState.inFlight = Math.max(0, peerState.inFlight - 1);
        peerState.failures += 1;

        if (error !== undefined && error !== null && String(error.message || error).includes("hash")) {
            peerState.invalidRanges += 1;
        }

        if (peerState.failures >= 3 || peerState.invalidRanges >= 1) {
            peerState.cooldownUntil = Date.now() + this.cooldownMs;
        }
    }

    snapshot() {
        return Array.from(this.peers.values()).map(peer => ({
            key: peer.key,
            successes: peer.successes,
            failures: peer.failures,
            invalidRanges: peer.invalidRanges,
            bytes: peer.bytes,
            inFlight: peer.inFlight,
            avgLatencyMs: Math.round(peer.avgLatencyMs),
            avgThroughputBytesPerSecond: Math.round(peer.avgThroughputBytesPerSecond),
            cooldownMsRemaining: Math.max(0, peer.cooldownUntil - Date.now())
        })).sort((left, right) => right.avgThroughputBytesPerSecond - left.avgThroughputBytesPerSecond);
    }
}

export class MgpUploadLimiter {
    constructor(options) {
        this.maxConcurrentUploads = options?.maxConcurrentUploads || 4;
        this.maxQueuedUploads = options?.maxQueuedUploads || 32;
        this.activeUploads = 0;
        this.queue = [];
    }

    async run(task) {
        if (this.activeUploads >= this.maxConcurrentUploads) {
            if (this.queue.length >= this.maxQueuedUploads) {
                throw new Error("upload-queue-full");
            }

            await new Promise((resolve) => {
                this.queue.push(resolve);
            });
        }

        this.activeUploads += 1;

        try {
            return await task();
        } finally {
            this.activeUploads -= 1;
            const next = this.queue.shift();

            if (next !== undefined) {
                next();
            }
        }
    }

    snapshot() {
        return {
            activeUploads: this.activeUploads,
            queuedUploads: this.queue.length,
            maxConcurrentUploads: this.maxConcurrentUploads
        };
    }
}

export function peerKey(protocol) {
    if (protocol === null || protocol === undefined) {
        return "unknown-peer";
    }

    if (typeof protocol.remotePeerId === "string") {
        return protocol.remotePeerId;
    }

    if (typeof protocol.peerId === "string") {
        return protocol.peerId;
    }

    return "peer-" + stableHash(String(protocol));
}

function movingAverage(current, sample, weight) {
    if (current === 0) {
        return sample;
    }

    return current * (1 - weight) + sample * weight;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function stableHash(value) {
    let hash = 2166136261;

    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16);
}
