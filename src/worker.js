import { PROVIDERS } from "./config/providers.js";
import { createMgpManifest, createMgpProviderSnapshot, createMgpRoutePacket } from "./mgp/protocol.js";
import { selectProviders } from "./routing/selector.js";
import { fetchThroughProvider } from "./routing/providerFetch.js";
import { getHealthSnapshot, markProviderFailure, markProviderSuccess } from "./routing/health.js";
import { createPeerFallbackResponse } from "./peer/peerFallback.js";

const BLOCK_STATUS_CODES = new Set([403, 404, 408, 409, 423, 425, 429, 451, 500, 502, 503, 504]);

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === "/health") {
            return Response.json({
                status: "ok",
                protocol: "mgp-edge",
                providers: createMgpProviderSnapshot(PROVIDERS, getHealthSnapshot())
            }, {
                headers: secureHeaders()
            });
        }

        if (url.pathname === "/providers") {
            return Response.json({
                protocol: "mgp-edge",
                providers: createMgpProviderSnapshot(PROVIDERS, getHealthSnapshot())
            }, {
                headers: secureHeaders()
            });
        }

        if (url.pathname === "/manifest") {
            const assetPath = url.searchParams.get("path") || "/video/example/episode-001/v1/chunk-0001.ts";
            return Response.json(createMgpManifest(assetPath, PROVIDERS), {
                headers: secureHeaders()
            });
        }

        if (url.pathname === "/peer/lookup") {
            return createPeerFallbackResponse(request, PROVIDERS);
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
            markProviderFailure(provider.name, "blocked-or-unhealthy-status-" + response.status);
            continue;
        }

        markProviderSuccess(provider.name, Date.now() - startedAt);

        const headers = new Headers(response.headers);
        headers.set("x-open-edge-provider", provider.name);
        headers.set("x-open-edge-route", "mgp-health-first");
        headers.set("x-mgp-route-id", routePacket.routeId);
        headers.set("x-mgp-provider-count", String(rankedProviders.length));

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: headers
        });
    }

    return null;
}

function secureHeaders() {
    return {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
    };
}
