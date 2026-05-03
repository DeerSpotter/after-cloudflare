import { MgpAdaptivePeerScheduler, MgpUploadLimiter } from "./mgpAdaptivePeerScheduler.js";

export class MgpChunkStore {
    constructor(options) {
        this.maxChunks = options?.maxChunks || 256;
        this.map = new Map();
    }

    has(chunkId) {
        return this.map.has(chunkId);
    }

    get(chunkId) {
        return this.map.get(chunkId) || null;
    }

    put(chunkId, bytes, sha256Hex) {
        if (this.map.size >= this.maxChunks) {
            const oldestKey = this.map.keys().next().value;
            this.map.delete(oldestKey);
        }

        this.map.set(chunkId, {
            chunkId: chunkId,
            bytes: bytes,
            sha256Hex: sha256Hex,
            byteLength: bytes.byteLength,
            storedAt: Date.now()
        });
    }

    chunkIds() {
        return Array.from(this.map.keys());
    }
}

export class MgpChunkProtocol {
    constructor(options) {
        this.peerId = options.peerId;
        this.remotePeerId = options.remotePeerId || null;
        this.channel = options.channel;
        this.store = options.store;
        this.pending = new Map();
        this.maxChunkBytes = options.maxChunkBytes || 4 * 1024 * 1024;
        this.maxRangeBytes = options.maxRangeBytes || 512 * 1024;
        this.timeoutMs = options.timeoutMs || 12000;
        this.uploadLimiter = options.uploadLimiter || new MgpUploadLimiter({
            maxConcurrentUploads: options.maxConcurrentUploads || 4,
            maxQueuedUploads: options.maxQueuedUploads || 32
        });
        this.channel.binaryType = "arraybuffer";
        this.channel.onmessage = (event) => this.onMessage(event);
    }

    async requestChunk(chunkId, expectedSha256Hex) {
        if (this.store.has(chunkId)) {
            const cached = this.store.get(chunkId);

            if (expectedSha256Hex === undefined || expectedSha256Hex === null || cached.sha256Hex === expectedSha256Hex) {
                return cached.bytes;
            }
        }

        const requestId = crypto.randomUUID();
        const envelope = {
            protocol: "mgp-chunk-v2",
            type: "chunk-request",
            requestId: requestId,
            fromPeerId: this.peerId,
            chunkId: chunkId,
            expectedSha256Hex: expectedSha256Hex || null,
            createdAt: Date.now()
        };

        const promise = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error("chunk-request-timeout"));
            }, this.timeoutMs);

            this.pending.set(requestId, {
                mode: "full",
                chunkId: chunkId,
                expectedSha256Hex: expectedSha256Hex || null,
                resolve: resolve,
                reject: reject,
                timer: timer
            });
        });

        this.channel.send(JSON.stringify(envelope));
        return promise;
    }

    async requestRange(chunkId, startByte, endByteExclusive, expectedChunkSha256Hex) {
        if (Number.isInteger(startByte) === false || Number.isInteger(endByteExclusive) === false || endByteExclusive <= startByte) {
            throw new Error("invalid-range-request");
        }

        const length = endByteExclusive - startByte;

        if (length > this.maxRangeBytes) {
            throw new Error("range-too-large");
        }

        const requestId = crypto.randomUUID();
        const envelope = {
            protocol: "mgp-chunk-v2",
            type: "range-request",
            requestId: requestId,
            fromPeerId: this.peerId,
            chunkId: chunkId,
            startByte: startByte,
            endByteExclusive: endByteExclusive,
            expectedChunkSha256Hex: expectedChunkSha256Hex || null,
            createdAt: Date.now()
        };

        const promise = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error("range-request-timeout"));
            }, this.timeoutMs);

            this.pending.set(requestId, {
                mode: "range",
                chunkId: chunkId,
                startByte: startByte,
                endByteExclusive: endByteExclusive,
                expectedChunkSha256Hex: expectedChunkSha256Hex || null,
                resolve: resolve,
                reject: reject,
                timer: timer
            });
        });

        this.channel.send(JSON.stringify(envelope));
        return promise;
    }

    async onMessage(event) {
        if (typeof event.data === "string") {
            await this.onTextMessage(event.data);
            return;
        }

        if (event.data instanceof ArrayBuffer) {
            await this.onBinaryMessage(event.data);
            return;
        }
    }

    async onTextMessage(text) {
        let envelope = null;

        try {
            envelope = JSON.parse(text);
        } catch (error) {
            return;
        }

        if (envelope === null || (envelope.protocol !== "mgp-chunk-v1" && envelope.protocol !== "mgp-chunk-v2")) {
            return;
        }

        if (envelope.type === "chunk-request") {
            await this.handleChunkRequest(envelope);
            return;
        }

        if (envelope.type === "range-request") {
            await this.handleRangeRequest(envelope);
            return;
        }

        if (envelope.type === "chunk-metadata" || envelope.type === "range-metadata") {
            await this.handleMetadata(envelope);
            return;
        }

        if (envelope.type === "chunk-error" || envelope.type === "range-error") {
            this.handleTransferError(envelope);
            return;
        }
    }

    async handleChunkRequest(envelope) {
        await this.uploadLimiter.run(async () => {
            const item = this.store.get(envelope.chunkId);

            if (item === null) {
                this.sendError("chunk-error", envelope.requestId, envelope.chunkId, "chunk-not-found");
                return;
            }

            if (envelope.expectedSha256Hex !== null && envelope.expectedSha256Hex !== undefined && envelope.expectedSha256Hex !== item.sha256Hex) {
                this.sendError("chunk-error", envelope.requestId, envelope.chunkId, "hash-mismatch-local-copy");
                return;
            }

            this.channel.send(JSON.stringify({
                protocol: "mgp-chunk-v2",
                type: "chunk-metadata",
                requestId: envelope.requestId,
                chunkId: item.chunkId,
                byteLength: item.bytes.byteLength,
                sha256Hex: item.sha256Hex
            }));

            this.channel.send(item.bytes);
        }).catch(() => {
            this.sendError("chunk-error", envelope.requestId, envelope.chunkId, "upload-limited");
        });
    }

    async handleRangeRequest(envelope) {
        await this.uploadLimiter.run(async () => {
            const item = this.store.get(envelope.chunkId);

            if (item === null) {
                this.sendError("range-error", envelope.requestId, envelope.chunkId, "chunk-not-found");
                return;
            }

            if (envelope.expectedChunkSha256Hex !== null && envelope.expectedChunkSha256Hex !== undefined && envelope.expectedChunkSha256Hex !== item.sha256Hex) {
                this.sendError("range-error", envelope.requestId, envelope.chunkId, "hash-mismatch-local-copy");
                return;
            }

            if (Number.isInteger(envelope.startByte) === false || Number.isInteger(envelope.endByteExclusive) === false) {
                this.sendError("range-error", envelope.requestId, envelope.chunkId, "invalid-range");
                return;
            }

            if (envelope.startByte < 0 || envelope.endByteExclusive > item.bytes.byteLength || envelope.endByteExclusive <= envelope.startByte) {
                this.sendError("range-error", envelope.requestId, envelope.chunkId, "range-out-of-bounds");
                return;
            }

            const rangeLength = envelope.endByteExclusive - envelope.startByte;

            if (rangeLength > this.maxRangeBytes) {
                this.sendError("range-error", envelope.requestId, envelope.chunkId, "range-too-large");
                return;
            }

            const rangeBytes = item.bytes.slice(envelope.startByte, envelope.endByteExclusive);
            const rangeSha256Hex = await sha256Hex(rangeBytes);

            this.channel.send(JSON.stringify({
                protocol: "mgp-chunk-v2",
                type: "range-metadata",
                requestId: envelope.requestId,
                chunkId: item.chunkId,
                startByte: envelope.startByte,
                endByteExclusive: envelope.endByteExclusive,
                byteLength: rangeBytes.byteLength,
                rangeSha256Hex: rangeSha256Hex,
                chunkSha256Hex: item.sha256Hex
            }));

            this.channel.send(rangeBytes);
        }).catch(() => {
            this.sendError("range-error", envelope.requestId, envelope.chunkId, "upload-limited");
        });
    }

    async handleMetadata(envelope) {
        const pending = this.pending.get(envelope.requestId);

        if (pending === undefined) {
            return;
        }

        if (envelope.type === "chunk-metadata" && envelope.byteLength > this.maxChunkBytes) {
            this.rejectPending(envelope.requestId, pending, "chunk-too-large");
            return;
        }

        if (envelope.type === "range-metadata") {
            const expectedLength = pending.endByteExclusive - pending.startByte;

            if (envelope.byteLength > this.maxRangeBytes || envelope.byteLength !== expectedLength) {
                this.rejectPending(envelope.requestId, pending, "invalid-range-length");
                return;
            }

            if (envelope.startByte !== pending.startByte || envelope.endByteExclusive !== pending.endByteExclusive) {
                this.rejectPending(envelope.requestId, pending, "range-metadata-mismatch");
                return;
            }
        }

        pending.metadata = envelope;
    }

    async onBinaryMessage(buffer) {
        let matchedRequestId = null;
        let matchedPending = null;

        for (const [requestId, pending] of this.pending.entries()) {
            if (pending.metadata !== undefined && pending.metadata.byteLength === buffer.byteLength) {
                matchedRequestId = requestId;
                matchedPending = pending;
                break;
            }
        }

        if (matchedPending === null) {
            return;
        }

        clearTimeout(matchedPending.timer);
        this.pending.delete(matchedRequestId);

        if (matchedPending.mode === "range") {
            const actualRangeHash = await sha256Hex(buffer);

            if (matchedPending.metadata.rangeSha256Hex !== actualRangeHash) {
                matchedPending.reject(new Error("range-hash-verification-failed"));
                return;
            }

            matchedPending.resolve({
                chunkId: matchedPending.chunkId,
                startByte: matchedPending.startByte,
                endByteExclusive: matchedPending.endByteExclusive,
                bytes: buffer,
                rangeSha256Hex: actualRangeHash,
                chunkSha256Hex: matchedPending.metadata.chunkSha256Hex
            });
            return;
        }

        const actualHash = await sha256Hex(buffer);
        const expectedHash = matchedPending.expectedSha256Hex || matchedPending.metadata.sha256Hex;

        if (expectedHash !== null && actualHash !== expectedHash) {
            matchedPending.reject(new Error("chunk-hash-verification-failed"));
            return;
        }

        this.store.put(matchedPending.chunkId, buffer, actualHash);
        matchedPending.resolve(buffer);
    }

    handleTransferError(envelope) {
        const pending = this.pending.get(envelope.requestId);

        if (pending === undefined) {
            return;
        }

        this.rejectPending(envelope.requestId, pending, envelope.error || "transfer-error");
    }

    rejectPending(requestId, pending, errorMessage) {
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        pending.reject(new Error(errorMessage));
    }

    sendError(type, requestId, chunkId, error) {
        this.channel.send(JSON.stringify({
            protocol: "mgp-chunk-v2",
            type: type,
            requestId: requestId,
            chunkId: chunkId,
            error: error
        }));
    }
}

export class MgpParallelChunkAssembler {
    constructor(options) {
        this.store = options.store;
        this.scheduler = options.scheduler || new MgpAdaptivePeerScheduler({
            maxPeersPerChunk: options.maxPeersPerChunk || 8
        });
        this.rangeSizeBytes = options.rangeSizeBytes || null;
        this.maxRetriesPerRange = options.maxRetriesPerRange || 3;
    }

    async fetchChunk(options) {
        const chunkId = options.chunkId;
        const expectedSha256Hex = options.expectedSha256Hex;
        const byteLength = options.byteLength;
        const peerProtocols = options.peerProtocols || [];
        const context = options.context || {};

        if (this.store.has(chunkId)) {
            const cached = this.store.get(chunkId);

            if (expectedSha256Hex === undefined || expectedSha256Hex === null || cached.sha256Hex === expectedSha256Hex) {
                return cached.bytes;
            }
        }

        if (Number.isInteger(byteLength) === false || byteLength <= 0) {
            throw new Error("parallel-chunk-byte-length-required");
        }

        const scheduledPeers = this.scheduler.selectPeers(peerProtocols, context);

        if (scheduledPeers.length === 0) {
            throw new Error("no-scheduled-peers-available");
        }

        const rangeSizeBytes = this.rangeSizeBytes || this.scheduler.chooseRangeSize({
            ...context,
            peerProtocols: peerProtocols
        });
        const ranges = buildRanges(byteLength, rangeSizeBytes);
        const results = new Array(ranges.length);
        let nextRangeIndex = 0;
        let activeFailure = null;
        const workerCount = Math.min(scheduledPeers.length, ranges.length);
        const workers = [];

        for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
            workers.push((async () => {
                while (activeFailure === null) {
                    const rangeIndex = nextRangeIndex;
                    nextRangeIndex += 1;

                    if (rangeIndex >= ranges.length) {
                        return;
                    }

                    const range = ranges[rangeIndex];
                    const result = await this.fetchRangeWithAdaptiveRetries({
                        range: range,
                        chunkId: chunkId,
                        expectedSha256Hex: expectedSha256Hex,
                        peerProtocols: peerProtocols,
                        context: context
                    });

                    results[rangeIndex] = result;
                }
            })().catch((error) => {
                activeFailure = error;
            }));
        }

        await Promise.all(workers);

        if (activeFailure !== null) {
            throw activeFailure;
        }

        const assembled = assembleRanges(byteLength, results);
        const actualHash = await sha256Hex(assembled);

        if (expectedSha256Hex !== undefined && expectedSha256Hex !== null && actualHash !== expectedSha256Hex) {
            throw new Error("assembled-chunk-hash-verification-failed");
        }

        this.store.put(chunkId, assembled, actualHash);
        return assembled;
    }

    async fetchRangeWithAdaptiveRetries(options) {
        let lastError = null;

        for (let attempt = 0; attempt < this.maxRetriesPerRange; attempt += 1) {
            const candidates = this.scheduler.selectPeers(options.peerProtocols, options.context);

            if (candidates.length === 0) {
                break;
            }

            const peerState = candidates[0];
            const startedAtMs = Date.now();
            this.scheduler.beginRange(peerState);

            try {
                const result = await peerState.protocol.requestRange(
                    options.chunkId,
                    options.range.startByte,
                    options.range.endByteExclusive,
                    options.expectedSha256Hex
                );
                this.scheduler.completeRange(peerState, result.bytes.byteLength, startedAtMs);
                return result;
            } catch (error) {
                lastError = error;
                this.scheduler.failRange(peerState, error);
            }
        }

        throw lastError || new Error("range-unavailable");
    }
}

export async function fetchChunkWithCdnThenPeers(options) {
    const chunkId = options.chunkId;
    const expectedSha256Hex = options.expectedSha256Hex;
    const cdnUrls = options.cdnUrls || [];
    const peerProtocols = options.peerProtocols || [];
    const store = options.store;

    for (const url of cdnUrls) {
        try {
            const res = await fetch(url, { cache: "force-cache" });

            if (res.ok === false) {
                continue;
            }

            const bytes = await res.arrayBuffer();
            const actualHash = await sha256Hex(bytes);

            if (expectedSha256Hex !== undefined && expectedSha256Hex !== null && actualHash !== expectedSha256Hex) {
                continue;
            }

            store.put(chunkId, bytes, actualHash);
            return bytes;
        } catch (error) {
        }
    }

    if (options.enableParallelPeerFetch === true && Number.isInteger(options.byteLength) === true && peerProtocols.length > 1) {
        const assembler = new MgpParallelChunkAssembler({
            store: store,
            scheduler: options.scheduler || null,
            rangeSizeBytes: options.rangeSizeBytes || null,
            maxPeersPerChunk: options.maxPeersPerChunk || 8,
            maxRetriesPerRange: options.maxRetriesPerRange || 3
        });

        return await assembler.fetchChunk({
            chunkId: chunkId,
            expectedSha256Hex: expectedSha256Hex,
            byteLength: options.byteLength,
            peerProtocols: peerProtocols,
            context: options.context || {}
        });
    }

    for (const protocol of peerProtocols) {
        try {
            return await protocol.requestChunk(chunkId, expectedSha256Hex);
        } catch (error) {
        }
    }

    throw new Error("chunk-unavailable");
}

export function buildRanges(byteLength, rangeSizeBytes) {
    const ranges = [];

    for (let startByte = 0; startByte < byteLength; startByte += rangeSizeBytes) {
        ranges.push({
            startByte: startByte,
            endByteExclusive: Math.min(startByte + rangeSizeBytes, byteLength)
        });
    }

    return ranges;
}

export function assembleRanges(byteLength, results) {
    const assembled = new Uint8Array(byteLength);

    for (const result of results) {
        if (result === undefined || result === null) {
            throw new Error("missing-range-result");
        }

        assembled.set(new Uint8Array(result.bytes), result.startByte);
    }

    return assembled.buffer;
}

export async function sha256Hex(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const bytes = new Uint8Array(digest);
    let output = "";

    for (let i = 0; i < bytes.length; i += 1) {
        output += bytes[i].toString(16).padStart(2, "0");
    }

    return output;
}
