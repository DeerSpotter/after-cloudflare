import { PROVIDERS } from "./config/providers.js";
import { applyRoutePolicyToProviders, resolveRoutePolicy } from "./config/routePolicies.js";
import { createMgpManifest, createMgpProviderSnapshot, createMgpRoutePacket } from "./mgp/protocol.js";
import { selectProviders } from "./routing/selector.js";
import { fetchThroughProvider } from "./routing/providerFetch.js";
import { getHealthSnapshot, getLayeredHealthSnapshot, markProviderFailure, markProviderSuccess } from "./routing/health.js";
import { createHealthLayers, createRouteScope } from "./routing/routeScope.js";
import { createPeerFallbackResponse } from "./peer/peerFallback.js";
import { createFallbackBlockedResponse, createOriginFallbackResponse } from "./origin/originFallback.js";
import { resolveSignalRoomName, createRoomInfo } from "./peer/roomPartition.js";
import { createAgentCdnControlReport } from "./agent/cdnControl.js";
import { MgpSignalRoom } from "./peer/signalingObject.js";
import { DemoPresenceRoom } from "./demo/presenceObject.js";

export { MgpSignalRoom, DemoPresenceRoom };

const BLOCK_STATUS_CODES = new Set([403, 404, 408, 409, 423, 425, 429, 451, 500, 502, 503, 504]);

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === "/demo/presence" || url.pathname === "/demo/presence-snapshot.json") {
            const id = env.DEMO_PRESENCE.idFromName("global-demo-presence");
            const stub = env.DEMO_PRESENCE.get(id);
            return stub.fetch(request);
        }

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

        if (url.pathname === "/agent/cdn-control") {
            return createAgentCdnControlResponse(request);
        }

        return await routeRequest(request);
    }
};

async function createAgentCdnControlResponse(request) {
    const url = new URL(request.url);
    const routeScope = createRouteScope(request);
    const routePolicy = resolveRoutePolicy(routeScope);
    const attempts = parseAttempts(url.searchParams.get("attempts"));

    const report = createAgentCdnControlReport({
        attempts,
        routePolicy,
        routeScope
    });

    return Response.json(report, { headers: secureHeaders() });
}

function parseAttempts(rawAttempts) {
    if (typeof rawAttempts !== "string" || rawAttempts.length === 0) {
        return [];
    }

    return rawAttempts
        .split(",")
        .map(part => part.trim())
        .filter(part => part.length > 0)
        .map(part => {
            const separatorIndex = part.indexOf(":");

            if (separatorIndex < 0) {
                return {
                    provider: part,
                    result: "PROVIDER_FETCH_ERROR"
                };
            }

            return {
                provider: part.slice(0, separatorIndex),
                result: part.slice(separatorIndex + 1)
            };
        });
}

async function routeRequest(request) {
    const startedAt = Date.now();
    const routeScope = createRouteScope(request);
    const routePolicy = resolveRoutePolicy(routeScope);
    const candidateProviders = applyRoutePolicyToProviders(PROVIDERS, routePolicy);
    const healthLayers = createHealthLayers(routeScope);
    const rankedProviders = selectProviders(candidateProviders, getLayeredHealthSnapshot(healthLayers));
    const routePacket = createMgpRoutePacket(request, rankedProviders, routeScope);
    const attempts = [];

    for (const provider of rankedProviders) {
        const fetchResult = await fetchThroughProvider(request, provider);

        if (fetchResult.ok !== true) {
            attempts.push({
                provider: provider.name,
                result: fetchResult.reason
            });
            markProviderFailureForScopes(routeScope, provider.name, normalizeFailureReason(fetchResult.reason));
            continue;
        }

        const response = fetchResult.response;

        if (BLOCK_STATUS_CODES.has(response.status)) {
            attempts.push({
                provider: provider.name,
                result: "PROVIDER_BLOCKED_" + response.status
            });
            markProviderFailureForScopes(routeScope, provider.name, "blocked-" + response.status);
            continue;
        }

        attempts.push({
            provider: provider.name,
            result: "PROVIDER_SUCCESS"
        });
        markProviderSuccessForScopes(routeScope, provider.name, Date.now() - startedAt);

        const headers = new Headers(response.headers);
        headers.set("x-open-edge-provider", provider.name);
        headers.set("x-mgp-route-id", routePacket.requestId);
        headers.set("x-flareless-provider", provider.name);
        headers.set("x-flareless-route-id", routePacket.requestId);
        headers.set("x-flareless-route-key", routePacket.routeKey);
        headers.set("x-flareless-request-id", routePacket.requestId);
        headers.set("x-flareless-policy-id", routePolicy.id);
        headers.set("x-flareless-reason", createRouteReason(attempts));
        headers.set("x-flareless-attempts", createAttemptHeader(attempts));

        const body = await response.arrayBuffer();

        return new Response(body, {
            status: response.status,
            headers
        });
    }

    if (routePolicy.allowPeerFallback === true) {
        return createPeerFallbackResponse(request, rankedProviders, 503, routePolicy);
    }

    if (routePolicy.allowOriginFallback === true) {
        return createOriginFallbackResponse(request, routePolicy, rankedProviders, 200);
    }

    return createFallbackBlockedResponse(request, routePolicy, rankedProviders, 503);
}

function markProviderFailureForScopes(routeScope, providerName, reason) {
    markProviderFailure(routeScope.routeKey, providerName, reason);
    markProviderFailure(routeScope.chunkKey, providerName, reason);
}

function markProviderSuccessForScopes(routeScope, providerName, latencyMs) {
    markProviderSuccess(routeScope.routeKey, providerName, latencyMs);
    markProviderSuccess(routeScope.chunkKey, providerName, latencyMs);
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
