import { MgpStreamingEngine } from "./mgpStreamingEngine.js";
import { MgpChunkStore } from "./mgpChunkProtocol.js";

export class MgpAbrMediaSourcePlayer {
    constructor(options) {
        this.videoElement = options.videoElement;
        this.manifestUrl = options.manifestUrl;
        this.mimeCodec = options.mimeCodec || "video/mp4; codecs=\"avc1.42E01E, mp4a.40.2\"";
        this.store = options.store || new MgpChunkStore({ maxChunks: options.maxChunks || 768 });
        this.peerProtocols = options.peerProtocols || [];
        this.mediaSource = null;
        this.sourceBuffer = null;
        this.appendQueue = [];
        this.isAppending = false;
        this.levels = [];
        this.activeLevel = 0;
        this.segmentIndex = 0;
        this.running = false;
        this.stats = {
            appendedSegments: 0,
            droppedSegments: 0,
            switches: 0,
            lastMeasuredKbps: 0,
            startedAt: Date.now()
        };
    }

    async start() {
        if (MediaSource.isTypeSupported(this.mimeCodec) === false) {
            throw new Error("unsupported-mime-codec");
        }

        const manifest = await this.loadAbrManifest();
        this.levels = normalizeLevels(manifest);

        if (this.levels.length === 0) {
            throw new Error("no-playable-levels");
        }

        this.activeLevel = chooseInitialLevel(this.levels);
        this.running = true;

        this.mediaSource = new MediaSource();
        this.videoElement.src = URL.createObjectURL(this.mediaSource);

        await new Promise((resolve, reject) => {
            this.mediaSource.addEventListener("sourceopen", resolve, { once: true });
            this.mediaSource.addEventListener("error", reject, { once: true });
        });

        this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mimeCodec);
        this.sourceBuffer.mode = "segments";
        this.sourceBuffer.addEventListener("updateend", () => this.flushAppendQueue());

        this.pumpLoop();
    }

    stop() {
        this.running = false;

        if (this.mediaSource !== null && this.mediaSource.readyState === "open") {
            try {
                this.mediaSource.endOfStream();
            } catch (error) {
            }
        }
    }

    async loadAbrManifest() {
        const response = await fetch(this.manifestUrl, { cache: "no-store" });

        if (response.ok === false) {
            throw new Error("abr-manifest-load-failed");
        }

        return await response.json();
    }

    async pumpLoop() {
        while (this.running) {
            try {
                await this.fillBuffer();
            } catch (error) {
                this.stats.droppedSegments += 1;
            }

            await sleep(150);
        }
    }

    async fillBuffer() {
        const bufferedAhead = getBufferedAheadSeconds(this.videoElement);

        if (bufferedAhead > 30) {
            return;
        }

        const level = this.levels[this.activeLevel];
        const segment = level.segments[this.segmentIndex];

        if (segment === undefined) {
            this.stop();
            return;
        }

        const engine = new MgpStreamingEngine({
            manifestUrl: this.manifestUrl,
            videoElement: this.videoElement,
            store: this.store,
            peerProtocols: this.peerProtocols,
            prefetchAhead: 4,
            maxParallelFetches: 2,
            minPeerBufferSeconds: 10
        });

        engine.segments = [segment];
        const startedAt = performance.now();
        const bytes = await engine.fetchSegment(segment);
        const elapsedMs = Math.max(1, performance.now() - startedAt);
        const measuredKbps = Math.round((bytes.byteLength * 8) / elapsedMs);

        this.stats.lastMeasuredKbps = measuredKbps;
        this.selectNextLevel(measuredKbps, bufferedAhead);
        this.queueAppend(bytes);
        this.segmentIndex += 1;
    }

    selectNextLevel(measuredKbps, bufferedAhead) {
        const current = this.levels[this.activeLevel];
        let selected = this.activeLevel;

        for (let i = 0; i < this.levels.length; i += 1) {
            const candidate = this.levels[i];
            const safeBitrate = candidate.bandwidthKbps * 1.35;

            if (measuredKbps >= safeBitrate && bufferedAhead >= 8) {
                selected = i;
            }
        }

        if (bufferedAhead < 5 && this.activeLevel > 0) {
            selected = Math.max(0, this.activeLevel - 1);
        }

        if (selected !== this.activeLevel) {
            this.activeLevel = selected;
            this.stats.switches += 1;
        }
    }

    queueAppend(bytes) {
        this.appendQueue.push(bytes);
        this.flushAppendQueue();
    }

    flushAppendQueue() {
        if (this.sourceBuffer === null || this.sourceBuffer.updating || this.appendQueue.length === 0) {
            return;
        }

        const bytes = this.appendQueue.shift();
        this.sourceBuffer.appendBuffer(bytes);
        this.stats.appendedSegments += 1;
    }

    snapshot() {
        return {
            activeLevel: this.activeLevel,
            activeLevelName: this.levels[this.activeLevel]?.name || null,
            segmentIndex: this.segmentIndex,
            bufferedAheadSeconds: getBufferedAheadSeconds(this.videoElement),
            queueLength: this.appendQueue.length,
            stats: this.stats
        };
    }
}

function normalizeLevels(manifest) {
    const rawLevels = Array.isArray(manifest.levels) ? manifest.levels : [];
    const levels = rawLevels.map((level, levelIndex) => {
        const bandwidthKbps = Number.isFinite(level.bandwidthKbps) ? level.bandwidthKbps : 1000;
        const segments = Array.isArray(level.segments) ? level.segments.map((segment, segmentIndex) => {
            const durationSeconds = Number.isFinite(segment.durationSeconds) ? segment.durationSeconds : 4;
            const startSeconds = Number.isFinite(segment.startSeconds) ? segment.startSeconds : segmentIndex * durationSeconds;

            return {
                chunkId: segment.chunkId || level.name + "-segment-" + segmentIndex,
                startSeconds: startSeconds,
                endSeconds: Number.isFinite(segment.endSeconds) ? segment.endSeconds : startSeconds + durationSeconds,
                durationSeconds: durationSeconds,
                sha256Hex: segment.sha256Hex || null,
                cdnUrls: Array.isArray(segment.cdnUrls) ? segment.cdnUrls : []
            };
        }) : [];

        return {
            name: level.name || "level-" + levelIndex,
            bandwidthKbps: bandwidthKbps,
            width: level.width || null,
            height: level.height || null,
            segments: segments
        };
    });

    return levels.sort((left, right) => left.bandwidthKbps - right.bandwidthKbps);
}

function chooseInitialLevel(levels) {
    if (levels.length <= 1) {
        return 0;
    }

    return Math.min(1, levels.length - 1);
}

function getBufferedAheadSeconds(videoElement) {
    if (videoElement.buffered.length === 0) {
        return 0;
    }

    const currentTime = videoElement.currentTime || 0;

    for (let i = 0; i < videoElement.buffered.length; i += 1) {
        const start = videoElement.buffered.start(i);
        const end = videoElement.buffered.end(i);

        if (currentTime >= start && currentTime <= end) {
            return Math.max(0, end - currentTime);
        }
    }

    return 0;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
