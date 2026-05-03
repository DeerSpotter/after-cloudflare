import { PROVIDERS } from "./config/providers.js";
import { createMgpManifest, createMgpProviderSnapshot, createMgpRoutePacket } from "./mgp/protocol.js";
import { selectProviders } from "./routing/selector.js";
import { fetchThroughProvider } from "./routing/providerFetch.js";
import { getHealthSnapshot, markProviderFailure, markProviderSuccess } from "./routing/health.js";
import { createPeerFallbackResponse } from "./peer/peerFallback.js";
import { resolveSignalRoomName, createRoomInfo } from "./peer/roomPartition.js";

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

    for (const provider of rankedProviders) {
        const response = await fetchThroughProvider(request, provider);

        if (response === null) {
            markProviderFailure(provider.name, "fetch-error");
            continue;
        }

        if (BLOCK_STATUS_CODES.has(response.status)) {
            markProviderFailure(provider.name, "blocked-" + response.status);
            continue;
        }

        markProviderSuccess(provider.name, Date.now() - startedAt);

        const headers = new Headers(response.headers);
        headers.set("x-open-edge-provider", provider.name);
        headers.set("x-mgp-route-id", routePacket.routeId);

        return new Response(response.body, {
            status: response.status,
            headers
        });
    }

    return null;
}

function secureHeaders() {
    return {
        "content-type": "application/json",
        "cache-control": "no-store"
    };
}
