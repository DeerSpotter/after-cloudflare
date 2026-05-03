import { MgpChunkStore, fetchChunkWithCdnThenPeers, sha256Hex } from "./mgpChunkProtocol.js";

export class MgpStreamingEngine {
    constructor(options) {
        this.manifestUrl = options.manifestUrl;
        this.videoElement = options.videoElement || null;
        this.store = options.store || new MgpChunkStore({ maxChunks: options.maxChunks || 512 });
        this.peerProtocols = options.peerProtocols || [];
        this.prefetchAhead = options.prefetchAhead || 6;
        this.maxParallelFetches = options.maxParallelFetches || 3;
        this.minPeerBufferSeconds = options.minPeerBufferSeconds || 12;
        this.segments = [];
        this.activeFetches = 0;
        this.nextPrefetchIndex = 0;
        this.stats = {
            cdnHits: 0,
            peerHits: 0,
            failedChunks: 0,
            verifiedChunks: 0,
            startedAt: Date.now()
        };
    }

    async loadManifest() {
        const res = await fetch(this.manifestUrl, { cache: "no-store" });

        if (res.ok === false) {
            throw new Error("manifest-load-failed");
        }

        const manifest = await res.json();
        this.segments = normalizeSegments(manifest);
        this.nextPrefetchIndex = 0;
        return this.segments;
    }

    startPrefetchLoop() {
        const tick = async () => {
            await this.prefetchWindow();
            setTimeout(tick, 500);
        };

        tick();
    }

    async prefetchWindow() {
        const currentIndex = this.getCurrentSegmentIndex();
        const targetIndex = Math.min(currentIndex + this.prefetchAhead, this.segments.length - 1);

        if (this.nextPrefetchIndex < currentIndex) {
            this.nextPrefetchIndex = currentIndex;
        }

        while (this.nextPrefetchIndex <= targetIndex && this.activeFetches < this.maxParallelFetches) {
            const segment = this.segments[this.nextPrefetchIndex];
            this.nextPrefetchIndex += 1;

            if (this.store.has(segment.chunkId)) {
                continue;
            }

            this.activeFetches += 1;
            this.fetchSegment(segment)
                .catch(() => {
                    this.stats.failedChunks += 1;
                })
                .finally(() => {
                    this.activeFetches -= 1;
                });
        }
    }

    async fetchSegment(segment) {
        const usePeers = this.shouldUsePeers();
        const peerProtocols = usePeers ? this.peerProtocols : [];

        const bytes = await fetchChunkWithCdnThenPeers({
            chunkId: segment.chunkId,
            expectedSha256Hex: segment.sha256Hex,
            cdnUrls: segment.cdnUrls,
            peerProtocols: peerProtocols,
            store: this.store
        });

        const actualHash = await sha256Hex(bytes);

        if (segment.sha256Hex !== null && segment.sha256Hex !== undefined && actualHash !== segment.sha256Hex) {
            throw new Error("stream-segment-hash-mismatch");
        }

        this.stats.verifiedChunks += 1;
        return bytes;
    }

    async getSegmentBytes(index) {
        const segment = this.segments[index];

        if (segment === undefined) {
            return null;
        }

        const cached = this.store.get(segment.chunkId);

        if (cached !== null) {
            return cached.bytes;
        }

        return await this.fetchSegment(segment);
    }

    getCurrentSegmentIndex() {
        if (this.videoElement === null || this.segments.length === 0) {
            return 0;
        }

        const currentTime = this.videoElement.currentTime || 0;

        for (let i = 0; i < this.segments.length; i += 1) {
            const segment = this.segments[i];

            if (currentTime >= segment.startSeconds && currentTime < segment.endSeconds) {
                return i;
            }
        }

        return 0;
    }

    getBufferedAheadSeconds() {
        if (this.videoElement === null || this.videoElement.buffered.length === 0) {
            return 0;
        }

        const currentTime = this.videoElement.currentTime || 0;

        for (let i = 0; i < this.videoElement.buffered.length; i += 1) {
            const start = this.videoElement.buffered.start(i);
            const end = this.videoElement.buffered.end(i);

            if (currentTime >= start && currentTime <= end) {
                return Math.max(0, end - currentTime);
            }
        }

        return 0;
    }

    shouldUsePeers() {
        return this.getBufferedAheadSeconds() >= this.minPeerBufferSeconds;
    }

    snapshot() {
        return {
            segmentCount: this.segments.length,
            cachedChunks: this.store.chunkIds().length,
            activeFetches: this.activeFetches,
            nextPrefetchIndex: this.nextPrefetchIndex,
            bufferedAheadSeconds: this.getBufferedAheadSeconds(),
            stats: this.stats
        };
    }
}

function normalizeSegments(manifest) {
    if (Array.isArray(manifest.segments)) {
        return manifest.segments.map(normalizeSegment).filter(Boolean);
    }

    if (Array.isArray(manifest.sources)) {
        return [{
            chunkId: manifest.path || "single-chunk",
            startSeconds: 0,
            endSeconds: 10,
            durationSeconds: 10,
            sha256Hex: manifest.sha256Hex || null,
            cdnUrls: manifest.sources.map(source => source.url || source).filter(Boolean)
        }];
    }

    return [];
}

function normalizeSegment(value, index) {
    if (value === null || typeof value !== "object") {
        return null;
    }

    const durationSeconds = Number.isFinite(value.durationSeconds) ? value.durationSeconds : 4;
    const startSeconds = Number.isFinite(value.startSeconds) ? value.startSeconds : index * durationSeconds;

    return {
        chunkId: value.chunkId || value.path || "segment-" + index,
        startSeconds: startSeconds,
        endSeconds: Number.isFinite(value.endSeconds) ? value.endSeconds : startSeconds + durationSeconds,
        durationSeconds: durationSeconds,
        sha256Hex: value.sha256Hex || null,
        cdnUrls: Array.isArray(value.cdnUrls) ? value.cdnUrls : []
    };
}
