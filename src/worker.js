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
import { createFailurePointTracker, formatFailurePointHeader } from "./agent/failurePointTracker.js";
import { createAgentInputFromRouteTrace, createRouteTraceFromRouteResult, encodeRouteTraceHeader, readRouteTraceFromRequest } from "./agent/routeTrace.js";
import {
    approveRecommendation,
    createRecommendationFromAgentReport,
    getRecommendation,
    lifecycleErrorResponse,
    listAuditEvents,
    listRecommendations,
    rejectRecommendation
} from "./agent/recommendationLifecycle.js";
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

        if (url.pathname === "/agent/recommendations" || url.pathname.startsWith("/agent/recommendations/")) {
            return createAgentRecommendationLifecycleResponse(request);
        }

        if (url.pathname === "/agent/audit-log") {
            return Response.json({ auditLog: listAuditEvents() }, { headers: secureHeaders() });
        }

        return await routeRequest(request);
    }
};

async function createAgentCdnControlResponse(request) {
    const report = await createAgentReportFromRequest(request);
    return Response.json(report, { headers: secureHeaders() });
}

async function createAgentRecommendationLifecycleResponse(request) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const recommendationId = parts[2] || null;
    const action = parts[3] || null;

    try {
        if (request.method === "POST" && url.pathname === "/agent/recommendations") {
            const report = await createAgentReportFromRequest(request);
            const recommendation = createRecommendationFromAgentReport(report);
            return Response.json({ recommendation }, { status: 201, headers: secureHeaders() });
        }

        if (request.method === "GET" && url.pathname === "/agent/recommendations") {
            return Response.json({ recommendations: listRecommendations() }, { headers: secureHeaders() });
        }

        if (request.method === "GET" && recommendationId && action === null) {
            const recommendation = getRecommendation(recommendationId);
            if (recommendation === null) {
                return Response.json({ error: "Recommendation was not found.", code: "RECOMMENDATION_NOT_FOUND" }, { status: 404, headers: secureHeaders() });
            }
            return Response.json({ recommendation }, { headers: secureHeaders() });
        }

        if (request.method === "POST" && recommendationId && action === "approve") {
            const decision = await readJsonBody(request);
            const recommendation = approveRecommendation(recommendationId, decision);
            return Response.json({ recommendation }, { headers: secureHeaders() });
        }

        if (request.method === "POST" && recommendationId && action === "reject") {
            const decision = await readJsonBody(request);
            const recommendation = rejectRecommendation(recommendationId, decision);
            return Response.json({ recommendation }, { headers: secureHeaders() });
        }
    } catch (err) {
        const errorResponse = lifecycleErrorResponse(err);
        return Response.json(errorResponse.body, { status: errorResponse.status, headers: secureHeaders() });
    }

    return Response.json({ error: "not found" }, { status: 404, headers: secureHeaders() });
}

async function createAgentReportFromRequest(request) {
    const url = new URL(request.url);
    const routeScope = createRouteScope(request);
    const routePolicy = resolveRoutePolicy(routeScope);
    const routeTrace = await readRouteTraceFromRequest(request);

    const reportInput = routeTrace === null
        ? {
            attempts: parseAttempts(url.searchParams.get("attempts")),
            failurePoints: parseFailurePoints(url.searchParams.get("failurePoints")),
            routePolicy,
            routeScope
        }
        : createAgentInputFromRouteTrace(routeTrace, routePolicy, routeScope);

    return createAgentCdnControlReport(reportInput);
}

async function readJsonBody(request) {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.toLowerCase().includes("application/json") === false) {
        return {};
    }

    try {
        return await request.json();
    } catch {
        return {};
    }
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

function parseFailurePoints(rawFailurePoints) {
    if (typeof rawFailurePoints !== "string" || rawFailurePoints.length === 0) {
        return [];
    }

    try {
        const parsed = JSON.parse(rawFailurePoints);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function routeRequest(request) {
    const startedAt = Date.now();
    const routeScope = createRouteScope(request);
    const routePolicy = resolveRoutePolicy(routeScope);
    const failurePointTracker = createFailurePointTracker(routeScope, routePolicy);
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
            failurePointTracker.addProviderFailure(provider.name, fetchResult.reason, {
                source: "providerFetch"
            });
            markProviderFailureForScopes(routeScope, provider.name, normalizeFailureReason(fetchResult.reason));
            continue;
        }

        const response = fetchResult.response;

        if (BLOCK_STATUS_CODES.has(response.status)) {
            const blockedResult = "PROVIDER_BLOCKED_" + response.status;
            attempts.push({
                provider: provider.name,
                result: blockedResult
            });
            failurePointTracker.addProviderFailure(provider.name, blockedResult, {
                status: response.status,
                source: "providerResponse"
            });
            markProviderFailureForScopes(routeScope, provider.name, "blocked-" + response.status);
            continue;
        }

        attempts.push({
            provider: provider.name,
            result: "PROVIDER_SUCCESS"
        });
        markProviderSuccessForScopes(routeScope, provider.name, Date.now() - startedAt);

        const failurePoints = failurePointTracker.snapshot();
        const routeReason = createRouteReason(attempts);
        const routeTrace = createRouteTraceFromRouteResult({
            requestId: routePacket.requestId,
            routeKey: routePacket.routeKey,
            policyId: routePolicy.id,
            attempts,
            failurePoints,
            selectedFallback: null,
            statusCode: response.status,
            provider: provider.name,
            reason: routeReason,
            outcome: "provider-success"
        });
        const headers = new Headers(response.headers);
        headers.set("x-open-edge-provider", provider.name);
        headers.set("x-mgp-route-id", routePacket.requestId);
        headers.set("x-flareless-provider", provider.name);
        headers.set("x-flareless-route-id", routePacket.requestId);
        headers.set("x-flareless-route-key", routePacket.routeKey);
        headers.set("x-flareless-request-id", routePacket.requestId);
        headers.set("x-flareless-policy-id", routePolicy.id);
        headers.set("x-flareless-reason", routeReason);
        headers.set("x-flareless-attempts", createAttemptHeader(attempts));
        headers.set("x-flareless-failure-points", formatFailurePointHeader(failurePoints));
        headers.set("x-flareless-route-trace", encodeRouteTraceHeader(routeTrace));

        const body = await response.arrayBuffer();

        return new Response(body, {
            status: response.status,
            headers
        });
    }

    if (routePolicy.allowPeerFallback === true) {
        failurePointTracker.addPeerFallbackPoint("PEER_FALLBACK_SELECTED", {
            rankedProviderCount: rankedProviders.length
        });
        return addTraceHeaders(
            createPeerFallbackResponse(request, rankedProviders, 503, routePolicy),
            createRouteTraceFromRouteResult({
                requestId: routePacket.requestId,
                routeKey: routePacket.routeKey,
                policyId: routePolicy.id,
                attempts,
                failurePoints: failurePointTracker.snapshot(),
                selectedFallback: "peer-fallback",
                statusCode: 503,
                provider: null,
                reason: "ALL_PROVIDERS_FAILED_PEER_FALLBACK_SELECTED",
                outcome: "peer-fallback"
            })
        );
    }

    if (routePolicy.allowOriginFallback === true) {
        failurePointTracker.addOriginFallbackPoint("ORIGIN_FALLBACK_SELECTED", {
            rankedProviderCount: rankedProviders.length
        });
        return addTraceHeaders(
            createOriginFallbackResponse(request, routePolicy, rankedProviders, 200),
            createRouteTraceFromRouteResult({
                requestId: routePacket.requestId,
                routeKey: routePacket.routeKey,
                policyId: routePolicy.id,
                attempts,
                failurePoints: failurePointTracker.snapshot(),
                selectedFallback: "origin-fallback",
                statusCode: 200,
                provider: null,
                reason: "ALL_PROVIDERS_FAILED_ORIGIN_FALLBACK_SELECTED",
                outcome: "origin-fallback"
            })
        );
    }

    failurePointTracker.addPolicyBlockedPoint("FALLBACK_BLOCKED_BY_POLICY", {
        rankedProviderCount: rankedProviders.length
    });
    return addTraceHeaders(
        createFallbackBlockedResponse(request, routePolicy, rankedProviders, 503),
        createRouteTraceFromRouteResult({
            requestId: routePacket.requestId,
            routeKey: routePacket.routeKey,
            policyId: routePolicy.id,
            attempts,
            failurePoints: failurePointTracker.snapshot(),
            selectedFallback: "fallback-blocked",
            statusCode: 503,
            provider: null,
            reason: "ALL_PROVIDERS_FAILED_FALLBACK_BLOCKED_BY_POLICY",
            outcome: "fallback-blocked"
        })
    );
}

function addTraceHeaders(response, routeTrace) {
    const headers = new Headers(response.headers);
    headers.set("x-flareless-failure-points", formatFailurePointHeader(routeTrace.failurePoints));
    headers.set("x-flareless-route-id", routeTrace.requestId);
    headers.set("x-flareless-request-id", routeTrace.requestId);
    headers.set("x-flareless-route-key", routeTrace.routeKey);
    headers.set("x-flareless-policy-id", routeTrace.policyId);
    headers.set("x-flareless-reason", routeTrace.finalStatus.reason || "ROUTE_TRACE_RECORDED");
    headers.set("x-flareless-attempts", createAttemptHeader(routeTrace.attempts));
    headers.set("x-flareless-route-trace", encodeRouteTraceHeader(routeTrace));

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
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
