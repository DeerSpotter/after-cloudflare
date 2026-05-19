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

        if (url.pathname !== "/demo/presence" && url.pathname !== "/demo/presence-snapshot.json") {
            return jsonResponse({
                protocol: "flareless-demo-presence-v1",
                status: "not-found"
            }, 404);
        }

        this.removeExpiredSessions();

        if (request.method === "GET") {
            return jsonResponse(this.createSnapshot(url.pathname));
        }

        if (request.method === "POST") {
            return await this.recordHeartbeat(request);
        }

        if (request.method === "DELETE") {
            const sessionId = normalizeId(url.searchParams.get("sessionId"));

            if (sessionId.length > 0) {
                this.sessions.delete(sessionId);
            }

            return jsonResponse(this.createSnapshot(url.pathname));
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
            poolMember: payload.poolMember === true,
            lastSeen: Date.now()
        });

        return jsonResponse(this.createSnapshot("/demo/presence"));
    }

    createSnapshot(pathname) {
        this.removeExpiredSessions();

        const activeSessions = Array.from(this.sessions.values());
        const poolMembers = activeSessions.filter(session => session.poolMember === true);

        const viewers = activeSessions
            .sort((left, right) => right.lastSeen - left.lastSeen)
            .slice(0, MAX_VIEWERS_RETURNED)
            .map(session => createPublicSession(session));

        return {
            protocol: pathname === "/demo/presence-snapshot.json" ? "flareless-micro-cdn-status-v1" : "flareless-demo-presence-v1",
            status: "ok",
            route: pathname,
            viewerCount: activeSessions.length,
            poolMemberCount: poolMembers.length,
            viewers: viewers,
            poolMembers: poolMembers
                .sort((left, right) => right.lastSeen - left.lastSeen)
                .slice(0, MAX_VIEWERS_RETURNED)
                .map(session => createPublicSession(session)),
            ttlMs: SESSION_TTL_MS,
            cachePolicy: pathname === "/demo/presence-snapshot.json" ? "micro-cdn-readable-control-snapshot" : "live-control-plane",
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

function createPublicSession(session) {
    return {
        sessionId: session.sessionId,
        label: session.label,
        route: session.route,
        poolMember: session.poolMember === true,
        secondsAgo: Math.max(0, Math.round((Date.now() - session.lastSeen) / 1000))
    };
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
        headers: corsHeaders(body.route)
    });
}

function corsHeaders(route = "/demo/presence") {
    return {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type",
        "cache-control": route === "/demo/presence-snapshot.json" ? "public, max-age=2" : "no-store",
        "content-type": "application/json"
    };
}
