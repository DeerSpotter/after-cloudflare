import { PROVIDERS } from "./config/providers.js";
import { createMgpManifest, createMgpProviderSnapshot, createMgpRoutePacket } from "./mgp/protocol.js";
import { selectProviders } from "./routing/selector.js";
import { fetchThroughProvider } from "./routing/providerFetch.js";
import { getHealthSnapshot, markProviderFailure, markProviderSuccess } from "./routing/health.js";
import { createPeerFallbackResponse } from "./peer/peerFallback.js";
import { resolveSignalRoomName, createRoomInfo } from "./peer/roomPartition.js";
import { MgpSignalRoom } from "./peer/signalingObject.js";

export { MgpSignalRoom };

const BLOCK_STATUS_CODES = new Set([403, 404, 408, 409, 423, 425, 429, 451, 500, 502, 503, 504]);

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === "/peer/ws") {
            const roomName = resolveSignalRoomName(request);
            const id = env.MGP_SIGNAL.idFromName(roomName);
            const stub = env.MGP_SIGNAL.get(id);
            return stub.fetch(request);
        }

        if (url.pathname === "/peer/room-info") {
            return Response.json(createRoomInfo(request));
        }

        if (url.pathname === "/health") {
            return Response.json({
                status: "ok",
                protocol: "mgp-edge",
                providers: createMgpProviderSnapshot(PROVIDERS, getHealthSnapshot())
            }, { headers: secureHeaders() });
        }

        if (url.pathname === "/manifest") {
            const assetPath = url.searchParams.get("path") || "/video/example/episode-001/v1/chunk-0001.ts";
            return Response.json(createMgpManifest(assetPath, PROVIDERS), { headers: secureHeaders() });
        }

        const routeResult = await routeRequest(request);

        if (routeResult !== null) {
            return routeResult;
        }

        return createPeerFallbackResponse(request, PROVIDERS, 503);
    }
};

async function routeRequest(request) {
    const startedAt = Date.now();
    const rankedProviders = selectProviders(PROVIDERS, getHealthSnapshot());
    const routePacket = createMgpRoutePacket(request, rankedProviders);
    const attempts = [];

    for (const provider of rankedProviders) {
        const fetchResult = await fetchThroughProvider(request, provider);

        if (fetchResult.ok !== true) {
            attempts.push({
                provider: provider.name,
                result: fetchResult.reason
            });
            markProviderFailure(provider.name, normalizeFailureReason(fetchResult.reason));
            continue;
        }

        const response = fetchResult.response;

        if (BLOCK_STATUS_CODES.has(response.status)) {
            attempts.push({
                provider: provider.name,
                result: "PROVIDER_BLOCKED_" + response.status
            });
            markProviderFailure(provider.name, "blocked-" + response.status);
            continue;
        }

        attempts.push({
            provider: provider.name,
            result: "PROVIDER_SUCCESS"
        });
        markProviderSuccess(provider.name, Date.now() - startedAt);

        const headers = new Headers(response.headers);
        headers.set("x-open-edge-provider", provider.name);
        headers.set("x-mgp-route-id", routePacket.routeId);
        headers.set("x-flareless-provider", provider.name);
        headers.set("x-flareless-route-id", routePacket.routeId);
        headers.set("x-flareless-reason", createRouteReason(attempts));
        headers.set("x-flareless-attempts", createAttemptHeader(attempts));

        const body = await response.arrayBuffer();

        return new Response(body, {
            status: response.status,
            headers
        });
    }

    return null;
}

function normalizeFailureReason(reason) {
    if (reason === "PROVIDER_TIMEOUT") {
        return "timeout";
    }

    return "fetch-error";
}

function createRouteReason(attempts) {
    if (attempts.length === 1 && attempts[0].result === "PROVIDER_SUCCESS") {
        return "PRIMARY_PROVIDER_SUCCESS";
    }

    if (attempts.some(attempt => attempt.result === "PROVIDER_TIMEOUT")) {
        return "PROVIDER_TIMEOUT_FAILOVER";
    }

    if (attempts.some(attempt => attempt.result.startsWith("PROVIDER_BLOCKED_"))) {
        return "PROVIDER_BLOCKED_FAILOVER";
    }

    return "PROVIDER_FAILOVER_SUCCESS";
}

function createAttemptHeader(attempts) {
    return attempts.map(attempt => attempt.provider + ":" + attempt.result).join(",");
}

function secureHeaders() {
    return {
        "content-type": "application/json",
        "cache-control": "no-store"
    };
}
