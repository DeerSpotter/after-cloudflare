export function createFailurePointTracker(routeScope = {}, routePolicy = {}) {
    const failurePoints = [];
    let sequence = 0;

    return {
        addProviderFailure(providerName, result, detail = {}) {
            sequence += 1;
            failurePoints.push(createFailurePoint({
                sequence,
                stage: classifyProviderStage(result),
                code: String(result || "PROVIDER_FETCH_ERROR"),
                provider: String(providerName || "unknown-provider"),
                routeKey: String(routeScope?.routeKey || "route:/"),
                chunkKey: String(routeScope?.chunkKey || "chunk:/"),
                policyId: String(routePolicy?.id || "unknown-policy"),
                fallbackAllowed: {
                    peer: routePolicy?.allowPeerFallback === true,
                    origin: routePolicy?.allowOriginFallback === true
                },
                detail
            }));
        },
        addPeerFallbackPoint(code, detail = {}) {
            sequence += 1;
            failurePoints.push(createFailurePoint({
                sequence,
                stage: "PEER_FALLBACK_DECISION",
                code: String(code || "PEER_FALLBACK_SELECTED"),
                provider: null,
                routeKey: String(routeScope?.routeKey || "route:/"),
                chunkKey: String(routeScope?.chunkKey || "chunk:/"),
                policyId: String(routePolicy?.id || "unknown-policy"),
                fallbackAllowed: {
                    peer: routePolicy?.allowPeerFallback === true,
                    origin: routePolicy?.allowOriginFallback === true
                },
                detail
            }));
        },
        addOriginFallbackPoint(code, detail = {}) {
            sequence += 1;
            failurePoints.push(createFailurePoint({
                sequence,
                stage: "ORIGIN_FALLBACK_DECISION",
                code: String(code || "ORIGIN_FALLBACK_SELECTED"),
                provider: null,
                routeKey: String(routeScope?.routeKey || "route:/"),
                chunkKey: String(routeScope?.chunkKey || "chunk:/"),
                policyId: String(routePolicy?.id || "unknown-policy"),
                fallbackAllowed: {
                    peer: routePolicy?.allowPeerFallback === true,
                    origin: routePolicy?.allowOriginFallback === true
                },
                detail
            }));
        },
        addPolicyBlockedPoint(code, detail = {}) {
            sequence += 1;
            failurePoints.push(createFailurePoint({
                sequence,
                stage: "POLICY_BLOCKED_FALLBACK",
                code: String(code || "FALLBACK_BLOCKED_BY_POLICY"),
                provider: null,
                routeKey: String(routeScope?.routeKey || "route:/"),
                chunkKey: String(routeScope?.chunkKey || "chunk:/"),
                policyId: String(routePolicy?.id || "unknown-policy"),
                fallbackAllowed: {
                    peer: routePolicy?.allowPeerFallback === true,
                    origin: routePolicy?.allowOriginFallback === true
                },
                detail
            }));
        },
        snapshot() {
            return failurePoints.map(point => ({ ...point }));
        }
    };
}

export function summarizeFailurePoints(failurePoints = []) {
    const points = Array.isArray(failurePoints) ? failurePoints : [];
    const stageCounts = {};
    const providerCounts = {};

    for (const point of points) {
        const stage = String(point?.stage || "UNKNOWN_STAGE");
        const provider = point?.provider === null || point?.provider === undefined ? null : String(point.provider);
        stageCounts[stage] = (stageCounts[stage] || 0) + 1;

        if (provider !== null) {
            providerCounts[provider] = (providerCounts[provider] || 0) + 1;
        }
    }

    return {
        count: points.length,
        firstFailurePoint: points[0] || null,
        lastFailurePoint: points.length > 0 ? points[points.length - 1] : null,
        stageCounts,
        providerCounts
    };
}

export function formatFailurePointHeader(failurePoints = []) {
    if (Array.isArray(failurePoints) === false || failurePoints.length === 0) {
        return "none";
    }

    return failurePoints
        .map(point => {
            const provider = point.provider ? point.provider + ":" : "";
            return point.sequence + ":" + point.stage + ":" + provider + point.code;
        })
        .join(",");
}

function createFailurePoint(input) {
    return {
        sequence: input.sequence,
        stage: input.stage,
        code: input.code,
        provider: input.provider,
        routeKey: input.routeKey,
        chunkKey: input.chunkKey,
        policyId: input.policyId,
        fallbackAllowed: input.fallbackAllowed,
        detail: input.detail || {}
    };
}

function classifyProviderStage(result) {
    if (result === "PROVIDER_TIMEOUT") {
        return "PROVIDER_TIMEOUT";
    }

    if (typeof result === "string" && result.startsWith("PROVIDER_BLOCKED_")) {
        return "PROVIDER_BLOCKED_STATUS";
    }

    return "PROVIDER_FETCH_ERROR";
}
