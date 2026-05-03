const DEFAULT_TTL_MS = 45000;
const MAX_PEERS_PER_CHUNK = 24;
const MAX_CHUNKS_PER_ANNOUNCE = 128;

const memoryPeerIndex = new Map();

export async function handlePeerMeshRequest(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/peer/announce") {
        return announcePeer(request, env);
    }

    if (request.method === "POST" && url.pathname === "/peer/signal") {
        return signalPeer(request, env);
    }

    if (request.method === "GET" && url.pathname === "/peer/lookup") {
        return lookupPeers(request, env);
    }

    if (request.method === "GET" && url.pathname === "/peer/stats") {
        return peerStats(env);
    }

    return null;
}

async function announcePeer(request, env) {
    const body = await safeJson(request);

    if (body === null) {
        return json({ error: "invalid-json" }, 400);
    }

    const peerId = normalizeId(body.peerId);
    const chunks = normalizeChunkList(body.chunks);
    const capabilities = normalizeCapabilities(body.capabilities);

    if (peerId.length === 0 || chunks.length === 0) {
        return json({ error: "missing-peer-or-chunks" }, 400);
    }

    const now = Date.now();
    const expiresAt = now + DEFAULT_TTL_MS;

    for (const chunkId of chunks) {
        let peers = memoryPeerIndex.get(chunkId);

        if (peers === undefined) {
            peers = new Map();
            memoryPeerIndex.set(chunkId, peers);
        }

        peers.set(peerId, {
            peerId: peerId,
            chunkId: chunkId,
            announcedAt: now,
            expiresAt: expiresAt,
            capabilities: capabilities
        });
    }

    return json({
        protocol: "mgp-peer-mesh",
        status: "announced",
        peerId: peerId,
        chunkCount: chunks.length,
        ttlMs: DEFAULT_TTL_MS
    });
}

async function lookupPeers(request, env) {
    const url = new URL(request.url);
    const chunkId = normalizeId(url.searchParams.get("chunk"));
    const excludePeerId = normalizeId(url.searchParams.get("excludePeerId"));

    if (chunkId.length === 0) {
        return json({ error: "missing-chunk" }, 400);
    }

    cleanupExpired();

    const peers = memoryPeerIndex.get(chunkId);
    const result = [];

    if (peers !== undefined) {
        for (const peer of peers.values()) {
            if (peer.peerId !== excludePeerId) {
                result.push({
                    peerId: peer.peerId,
                    chunkId: peer.chunkId,
                    announcedAt: peer.announcedAt,
                    expiresAt: peer.expiresAt,
                    capabilities: peer.capabilities
                });
            }

            if (result.length >= MAX_PEERS_PER_CHUNK) {
                break;
            }
        }
    }

    return json({
        protocol: "mgp-peer-mesh",
        chunkId: chunkId,
        peers: result,
        peerCount: result.length
    });
}

async function signalPeer(request, env) {
    const body = await safeJson(request);

    if (body === null) {
        return json({ error: "invalid-json" }, 400);
    }

    const fromPeerId = normalizeId(body.fromPeerId);
    const toPeerId = normalizeId(body.toPeerId);
    const signalType = normalizeId(body.type);
    const payload = body.payload;

    if (fromPeerId.length === 0 || toPeerId.length === 0 || signalType.length === 0 || payload === undefined) {
        return json({ error: "missing-signal-fields" }, 400);
    }

    return json({
        protocol: "mgp-peer-mesh",
        status: "signal-accepted",
        fromPeerId: fromPeerId,
        toPeerId: toPeerId,
        type: signalType,
        note: "This Worker endpoint validates signaling envelopes. Production delivery should bind this to Durable Objects, WebSockets, or another persistent signaling channel."
    });
}

function peerStats(env) {
    cleanupExpired();

    let peerRefs = 0;

    for (const peers of memoryPeerIndex.values()) {
        peerRefs += peers.size;
    }

    return json({
        protocol: "mgp-peer-mesh",
        chunkCount: memoryPeerIndex.size,
        peerReferences: peerRefs,
        ttlMs: DEFAULT_TTL_MS
    });
}

function cleanupExpired() {
    const now = Date.now();

    for (const [chunkId, peers] of memoryPeerIndex.entries()) {
        for (const [peerId, peer] of peers.entries()) {
            if (peer.expiresAt <= now) {
                peers.delete(peerId);
            }
        }

        if (peers.size === 0) {
            memoryPeerIndex.delete(chunkId);
        }
    }
}

async function safeJson(request) {
    try {
        return await request.json();
    } catch (error) {
        return null;
    }
}

function normalizeId(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().slice(0, 256);
}

function normalizeChunkList(value) {
    if (Array.isArray(value) === false) {
        return [];
    }

    const result = [];
    const seen = new Set();

    for (const item of value) {
        const chunkId = normalizeId(item);

        if (chunkId.length > 0 && seen.has(chunkId) === false) {
            seen.add(chunkId);
            result.push(chunkId);
        }

        if (result.length >= MAX_CHUNKS_PER_ANNOUNCE) {
            break;
        }
    }

    return result;
}

function normalizeCapabilities(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    return {
        webrtc: value.webrtc === true,
        dataChannel: value.dataChannel === true,
        maxUploadKbps: Number.isFinite(value.maxUploadKbps) ? value.maxUploadKbps : null
    };
}

function json(value, status) {
    return Response.json(value, {
        status: status || 200,
        headers: {
            "cache-control": "no-store",
            "x-content-type-options": "nosniff"
        }
    });
}
