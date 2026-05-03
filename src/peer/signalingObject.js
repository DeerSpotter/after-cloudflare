export class MgpSignalRoom {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.sessions = new Map();
    }

    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname !== "/peer/ws") {
            return new Response("Not found", { status: 404 });
        }

        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("Expected WebSocket", { status: 426 });
        }

        const peerId = normalizePeerId(url.searchParams.get("peerId"));

        if (peerId.length === 0) {
            return new Response("Missing peerId", { status: 400 });
        }

        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];

        server.accept();
        this.attachPeer(peerId, server);

        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }

    attachPeer(peerId, socket) {
        const oldSocket = this.sessions.get(peerId);

        if (oldSocket !== undefined) {
            safeClose(oldSocket, 4000, "peer-reconnected");
        }

        this.sessions.set(peerId, socket);

        socket.send(JSON.stringify({
            protocol: "mgp-signal-v1",
            type: "joined",
            peerId: peerId,
            connectedPeers: Array.from(this.sessions.keys())
        }));

        this.broadcast(peerId, {
            protocol: "mgp-signal-v1",
            type: "peer-joined",
            peerId: peerId
        });

        socket.addEventListener("message", event => {
            this.handleMessage(peerId, event.data);
        });

        socket.addEventListener("close", () => {
            this.detachPeer(peerId, socket);
        });

        socket.addEventListener("error", () => {
            this.detachPeer(peerId, socket);
        });
    }

    handleMessage(fromPeerId, rawData) {
        if (typeof rawData !== "string") {
            return;
        }

        let envelope = null;

        try {
            envelope = JSON.parse(rawData);
        } catch (error) {
            return;
        }

        if (envelope === null || envelope.protocol !== "mgp-signal-v1") {
            return;
        }

        if (envelope.type === "ping") {
            const socket = this.sessions.get(fromPeerId);

            if (socket !== undefined) {
                socket.send(JSON.stringify({
                    protocol: "mgp-signal-v1",
                    type: "pong",
                    peerId: fromPeerId,
                    now: Date.now()
                }));
            }

            return;
        }

        if (envelope.type === "offer" || envelope.type === "answer" || envelope.type === "ice-candidate") {
            this.forwardSignal(fromPeerId, envelope);
            return;
        }
    }

    forwardSignal(fromPeerId, envelope) {
        const toPeerId = normalizePeerId(envelope.toPeerId);

        if (toPeerId.length === 0) {
            return;
        }

        const destination = this.sessions.get(toPeerId);

        if (destination === undefined) {
            const source = this.sessions.get(fromPeerId);

            if (source !== undefined) {
                source.send(JSON.stringify({
                    protocol: "mgp-signal-v1",
                    type: "peer-unavailable",
                    toPeerId: toPeerId
                }));
            }

            return;
        }

        destination.send(JSON.stringify({
            protocol: "mgp-signal-v1",
            type: envelope.type,
            fromPeerId: fromPeerId,
            toPeerId: toPeerId,
            payload: envelope.payload || null,
            createdAt: Date.now()
        }));
    }

    detachPeer(peerId, socket) {
        const current = this.sessions.get(peerId);

        if (current !== socket) {
            return;
        }

        this.sessions.delete(peerId);

        this.broadcast(peerId, {
            protocol: "mgp-signal-v1",
            type: "peer-left",
            peerId: peerId
        });
    }

    broadcast(excludePeerId, envelope) {
        const payload = JSON.stringify(envelope);

        for (const [peerId, socket] of this.sessions.entries()) {
            if (peerId !== excludePeerId) {
                socket.send(payload);
            }
        }
    }
}

function normalizePeerId(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().slice(0, 128);
}

function safeClose(socket, code, reason) {
    try {
        socket.close(code, reason);
    } catch (error) {
    }
}
