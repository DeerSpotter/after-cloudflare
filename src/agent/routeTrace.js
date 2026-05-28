export function createRouteTrace(input = {}) {
    const attempts = normalizeAttempts(input.attempts);
    const failurePoints = normalizeFailurePoints(input.failurePoints);
    const selectedFallback = input.selectedFallback === null || input.selectedFallback === undefined
        ? null
        : String(input.selectedFallback);

    return {
        requestId: String(input.requestId || "unknown-request"),
        routeKey: String(input.routeKey || "route:/"),
        policyId: String(input.policyId || "unknown-policy"),
        attempts,
        failurePoints,
        selectedFallback,
        finalStatus: normalizeFinalStatus(input.finalStatus),
        generatedAt: Number.isFinite(Number(input.generatedAt)) ? Number(input.generatedAt) : Date.now()
    };
}

export function createRouteTraceFromRouteResult(input = {}) {
    return createRouteTrace({
        requestId: input.requestId,
        routeKey: input.routeKey,
        policyId: input.policyId,
        attempts: input.attempts,
        failurePoints: input.failurePoints,
        selectedFallback: input.selectedFallback,
        finalStatus: {
            statusCode: input.statusCode,
            provider: input.provider,
            reason: input.reason,
            outcome: input.outcome
        }
    });
}

export function createAgentInputFromRouteTrace(routeTrace = {}, routePolicy = {}, routeScope = {}) {
    const trace = createRouteTrace(routeTrace);

    return {
        attempts: trace.attempts,
        failurePoints: trace.failurePoints,
        routePolicy: {
            ...routePolicy,
            id: routePolicy?.id || trace.policyId,
            routeKey: routePolicy?.routeKey || trace.routeKey
        },
        routeScope: {
            ...routeScope,
            routeKey: routeScope?.routeKey || trace.routeKey
        },
        routeTrace: trace
    };
}

export function encodeRouteTraceHeader(routeTrace = {}) {
    const trace = createRouteTrace(routeTrace);
    const compactTrace = {
        requestId: trace.requestId,
        routeKey: trace.routeKey,
        policyId: trace.policyId,
        attempts: trace.attempts,
        selectedFallback: trace.selectedFallback,
        finalStatus: trace.finalStatus
    };

    return encodeURIComponent(JSON.stringify(compactTrace));
}

export async function readRouteTraceFromRequest(request) {
    if (request.method !== "POST") {
        return null;
    }

    const contentType = request.headers.get("content-type") || "";

    if (contentType.toLowerCase().includes("application/json") === false) {
        return null;
    }

    try {
        const body = await request.json();
        const rawTrace = body?.routeTrace || body;

        if (rawTrace && typeof rawTrace === "object") {
            return createRouteTrace(rawTrace);
        }
    } catch {
        return null;
    }

    return null;
}

function normalizeAttempts(attempts) {
    if (Array.isArray(attempts) === false) {
        return [];
    }

    return attempts
        .filter(attempt => attempt && typeof attempt === "object")
        .map(attempt => ({
            provider: String(attempt.provider || "unknown-provider"),
            result: String(attempt.result || "PROVIDER_FETCH_ERROR")
        }));
}

function normalizeFailurePoints(failurePoints) {
    if (Array.isArray(failurePoints) === false) {
        return [];
    }

    return failurePoints
        .filter(point => point && typeof point === "object")
        .map((point, index) => ({
            sequence: Number.isFinite(Number(point.sequence)) ? Number(point.sequence) : index + 1,
            stage: String(point.stage || "UNKNOWN_STAGE"),
            code: String(point.code || "UNKNOWN_FAILURE_POINT"),
            provider: point.provider === null || point.provider === undefined ? null : String(point.provider),
            routeKey: String(point.routeKey || "route:/"),
            chunkKey: String(point.chunkKey || "chunk:/"),
            policyId: String(point.policyId || "unknown-policy"),
            fallbackAllowed: {
                peer: point.fallbackAllowed?.peer === true,
                origin: point.fallbackAllowed?.origin === true
            },
            detail: point.detail && typeof point.detail === "object" ? point.detail : {}
        }));
}

function normalizeFinalStatus(finalStatus) {
    if (finalStatus && typeof finalStatus === "object") {
        return {
            outcome: String(finalStatus.outcome || "unknown"),
            statusCode: Number.isFinite(Number(finalStatus.statusCode)) ? Number(finalStatus.statusCode) : null,
            provider: finalStatus.provider === null || finalStatus.provider === undefined ? null : String(finalStatus.provider),
            reason: finalStatus.reason === null || finalStatus.reason === undefined ? null : String(finalStatus.reason)
        };
    }

    return {
        outcome: "unknown",
        statusCode: null,
        provider: null,
        reason: null
    };
}
