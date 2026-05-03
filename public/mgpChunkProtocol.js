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
        this.channel = options.channel;
        this.store = options.store;
        this.pending = new Map();
        this.maxChunkBytes = options.maxChunkBytes || 4 * 1024 * 1024;
        this.timeoutMs = options.timeoutMs || 12000;
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
            protocol: "mgp-chunk-v1",
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

        if (envelope === null || envelope.protocol !== "mgp-chunk-v1") {
            return;
        }

        if (envelope.type === "chunk-request") {
            await this.handleChunkRequest(envelope);
            return;
        }

        if (envelope.type === "chunk-metadata") {
            await this.handleChunkMetadata(envelope);
            return;
        }

        if (envelope.type === "chunk-error") {
            this.handleChunkError(envelope);
            return;
        }
    }

    async handleChunkRequest(envelope) {
        const item = this.store.get(envelope.chunkId);

        if (item === null) {
            this.channel.send(JSON.stringify({
                protocol: "mgp-chunk-v1",
                type: "chunk-error",
                requestId: envelope.requestId,
                chunkId: envelope.chunkId,
                error: "chunk-not-found"
            }));
            return;
        }

        if (envelope.expectedSha256Hex !== null && envelope.expectedSha256Hex !== item.sha256Hex) {
            this.channel.send(JSON.stringify({
                protocol: "mgp-chunk-v1",
                type: "chunk-error",
                requestId: envelope.requestId,
                chunkId: envelope.chunkId,
                error: "hash-mismatch-local-copy"
            }));
            return;
        }

        this.channel.send(JSON.stringify({
            protocol: "mgp-chunk-v1",
            type: "chunk-metadata",
            requestId: envelope.requestId,
            chunkId: item.chunkId,
            byteLength: item.bytes.byteLength,
            sha256Hex: item.sha256Hex
        }));

        this.channel.send(item.bytes);
    }

    async handleChunkMetadata(envelope) {
        const pending = this.pending.get(envelope.requestId);

        if (pending === undefined) {
            return;
        }

        if (envelope.byteLength > this.maxChunkBytes) {
            clearTimeout(pending.timer);
            this.pending.delete(envelope.requestId);
            pending.reject(new Error("chunk-too-large"));
            return;
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

        const actualHash = await sha256Hex(buffer);
        const expectedHash = matchedPending.expectedSha256Hex || matchedPending.metadata.sha256Hex;

        clearTimeout(matchedPending.timer);
        this.pending.delete(matchedRequestId);

        if (expectedHash !== null && actualHash !== expectedHash) {
            matchedPending.reject(new Error("chunk-hash-verification-failed"));
            return;
        }

        this.store.put(matchedPending.chunkId, buffer, actualHash);
        matchedPending.resolve(buffer);
    }

    handleChunkError(envelope) {
        const pending = this.pending.get(envelope.requestId);

        if (pending === undefined) {
            return;
        }

        clearTimeout(pending.timer);
        this.pending.delete(envelope.requestId);
        pending.reject(new Error(envelope.error || "chunk-error"));
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

    for (const protocol of peerProtocols) {
        try {
            return await protocol.requestChunk(chunkId, expectedSha256Hex);
        } catch (error) {
        }
    }

    throw new Error("chunk-unavailable");
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
