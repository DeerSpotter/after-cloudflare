const SESSION_TTL_MS = 15000;
const MAX_VIEWERS_RETURNED = 20;

export class DemoPresenceRoom {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.sessions = new Map();
    }

    async fetch(request) {
        const url = new URL(request.url);

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: corsHeaders()
            });
        }

        if (url.pathname !== "/demo/presence") {
            return jsonResponse({
                protocol: "flareless-demo-presence-v1",
                status: "not-found"
            }, 404);
        }

        this.removeExpiredSessions();

        if (request.method === "GET") {
            return jsonResponse(this.createSnapshot());
        }

        if (request.method === "POST") {
            return await this.recordHeartbeat(request);
        }

        if (request.method === "DELETE") {
            const sessionId = normalizeId(url.searchParams.get("sessionId"));

            if (sessionId.length > 0) {
                this.sessions.delete(sessionId);
            }

            return jsonResponse(this.createSnapshot());
        }

        return jsonResponse({
            protocol: "flareless-demo-presence-v1",
            status: "method-not-allowed"
        }, 405);
    }

    async recordHeartbeat(request) {
        let payload = null;

        try {
            payload = await request.json();
        } catch (error) {
            return jsonResponse({
                protocol: "flareless-demo-presence-v1",
                status: "bad-request",
                reason: "expected-json-body"
            }, 400);
        }

        const sessionId = normalizeId(payload.sessionId);

        if (sessionId.length === 0) {
            return jsonResponse({
                protocol: "flareless-demo-presence-v1",
                status: "bad-request",
                reason: "missing-session-id"
            }, 400);
        }

        this.sessions.set(sessionId, {
            sessionId: sessionId,
            label: normalizeLabel(payload.label),
            route: normalizeRoute(payload.route),
            lastSeen: Date.now()
        });

        return jsonResponse(this.createSnapshot());
    }

    createSnapshot() {
        this.removeExpiredSessions();

        const viewers = Array.from(this.sessions.values())
            .sort((left, right) => right.lastSeen - left.lastSeen)
            .slice(0, MAX_VIEWERS_RETURNED)
            .map(session => ({
                sessionId: session.sessionId,
                label: session.label,
                route: session.route,
                secondsAgo: Math.max(0, Math.round((Date.now() - session.lastSeen) / 1000))
            }));

        return {
            protocol: "flareless-demo-presence-v1",
            status: "ok",
            viewerCount: this.sessions.size,
            viewers: viewers,
            ttlMs: SESSION_TTL_MS,
            serverTime: new Date().toISOString()
        };
    }

    removeExpiredSessions() {
        const now = Date.now();

        for (const [sessionId, session] of this.sessions.entries()) {
            if (now - session.lastSeen > SESSION_TTL_MS) {
                this.sessions.delete(sessionId);
            }
        }
    }
}

function normalizeId(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 96);
}

function normalizeLabel(value) {
    if (typeof value !== "string") {
        return "Browser viewer";
    }

    const normalized = value.trim().replace(/\s+/g, " ").slice(0, 64);

    if (normalized.length === 0) {
        return "Browser viewer";
    }

    return normalized;
}

function normalizeRoute(value) {
    if (typeof value !== "string") {
        return "demo";
    }

    const normalized = value.trim().replace(/\s+/g, " ").slice(0, 96);

    if (normalized.length === 0) {
        return "demo";
    }

    return normalized;
}

function jsonResponse(body, status = 200) {
    return Response.json(body, {
        status: status,
        headers: corsHeaders()
    });
}

function corsHeaders() {
    return {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type",
        "cache-control": "no-store",
        "content-type": "application/json"
    };
}
