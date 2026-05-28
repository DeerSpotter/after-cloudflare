import { summarizeFailurePoints } from "./failurePointTracker.js";
import { createRouteTrace } from "./routeTrace.js";

const PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT";
const PROVIDER_FETCH_ERROR = "PROVIDER_FETCH_ERROR";
const PROVIDER_SUCCESS = "PROVIDER_SUCCESS";
const PROVIDER_BLOCKED_PREFIX = "PROVIDER_BLOCKED_";

export function createAgentCdnControlReport(input = {}) {
    const attempts = normalizeAttempts(input.attempts);
    const failurePoints = normalizeFailurePoints(input.failurePoints);
    const routePolicy = normalizeRoutePolicy(input.routePolicy);
    const routeScope = normalizeRouteScope(input.routeScope);
    const routeTrace = input.routeTrace && typeof input.routeTrace === "object" ? createRouteTrace(input.routeTrace) : null;
    const summary = summarizeAttempts(attempts);
    const failurePointSummary = summarizeFailurePoints(failurePoints);
    const notices = createAgentNotices(summary, failurePointSummary, routePolicy, routeScope);
    const recommendation = createAgentRecommendation(summary, failurePointSummary, routePolicy, routeScope);

    return {
        agent: "flareless-agent-cdn-control",
        mode: "observe-and-recommend",
        routeKey: routeScope.routeKey,
        policyId: routePolicy.id,
        routeTrace,
        summary,
        failurePoints,
        failurePointSummary,
        notices,
        recommendation,
        proposedPolicy: applyAgentRecommendationToPolicy(routePolicy, recommendation)
    };
}

export function applyAgentRecommendationToPolicy(routePolicy = {}, recommendation = {}) {
    const normalizedPolicy = normalizeRoutePolicy(routePolicy);

    return {
        ...normalizedPolicy,
        agentAssisted: true,
        agentRecommendationId: recommendation.id || "NO_RECOMMENDATION",
        agentAction: recommendation.action || "OBSERVE_ONLY",
        agentReason: recommendation.reason || "No agent recommendation was produced.",
        cooldownProviderNames: Array.isArray(recommendation.cooldownProviderNames) ? recommendation.cooldownProviderNames : [],
        failureStage: recommendation.failureStage || null,
        failurePointCode: recommendation.failurePointCode || null,
        allowPeerFallback: recommendation.keepPeerFallback === true ? true : normalizedPolicy.allowPeerFallback,
        allowOriginFallback: recommendation.allowOriginFallback === true ? true : normalizedPolicy.allowOriginFallback
    };
}

function normalizeAttempts(attempts) {
    if (Array.isArray(attempts) === false) {
        return [];
    }

    return attempts
        .filter(attempt => attempt && typeof attempt === "object")
        .map(attempt => ({
            provider: String(attempt.provider || "unknown-provider"),
            result: String(attempt.result || PROVIDER_FETCH_ERROR)
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

function normalizeRoutePolicy(routePolicy) {
    return {
        id: String(routePolicy?.id || "unknown-policy"),
        allowPeerFallback: routePolicy?.allowPeerFallback === true,
        allowOriginFallback: routePolicy?.allowOriginFallback === true,
        healthScope: String(routePolicy?.healthScope || "route"),
        pathPrefix: String(routePolicy?.pathPrefix || "/")
    };
}

function normalizeRouteScope(routeScope) {
    return {
        routeKey: String(routeScope?.routeKey || "route:/"),
        chunkKey: String(routeScope?.chunkKey || "chunk:/"),
        path: String(routeScope?.path || "/")
    };
}

function summarizeAttempts(attempts) {
    const failedAttempts = attempts.filter(attempt => attempt.result !== PROVIDER_SUCCESS);
    const successfulAttempt = attempts.find(attempt => attempt.result === PROVIDER_SUCCESS) || null;
    const timeoutProviders = failedAttempts
        .filter(attempt => attempt.result === PROVIDER_TIMEOUT)
        .map(attempt => attempt.provider);
    const blockedProviders = failedAttempts
        .filter(attempt => attempt.result.startsWith(PROVIDER_BLOCKED_PREFIX))
        .map(attempt => attempt.provider);
    const fetchErrorProviders = failedAttempts
        .filter(attempt => attempt.result === PROVIDER_FETCH_ERROR)
        .map(attempt => attempt.provider);

    return {
        attemptCount: attempts.length,
        failedCount: failedAttempts.length,
        success: successfulAttempt !== null,
        selectedProvider: successfulAttempt?.provider || null,
        timeoutProviders,
        blockedProviders,
        fetchErrorProviders,
        failedProviders: uniqueNames(failedAttempts.map(attempt => attempt.provider))
    };
}

function createAgentNotices(summary, failurePointSummary, routePolicy, routeScope) {
    const notices = [];

    if (summary.attemptCount === 0) {
        notices.push({
            severity: "warning",
            code: "NO_ROUTE_ATTEMPTS",
            message: "The agent did not receive provider attempts to analyze."
        });
    }

    if (failurePointSummary.count > 0) {
        notices.push({
            severity: "error",
            code: "FAILURE_POINT_CHAIN_DETECTED",
            message: "The agent received a failure point chain for this route.",
            firstFailurePoint: failurePointSummary.firstFailurePoint,
            lastFailurePoint: failurePointSummary.lastFailurePoint
        });
    }

    if (summary.timeoutProviders.length > 0) {
        notices.push({
            severity: "error",
            code: "PROVIDER_TIMEOUT_DETECTED",
            message: "The agent detected provider timeout behavior on this route.",
            providers: summary.timeoutProviders
        });
    }

    if (summary.blockedProviders.length > 0) {
        notices.push({
            severity: "error",
            code: "PROVIDER_BLOCK_RESPONSE_DETECTED",
            message: "The agent detected provider block or failure status behavior on this route.",
            providers: summary.blockedProviders
        });
    }

    if (summary.fetchErrorProviders.length > 0) {
        notices.push({
            severity: "warning",
            code: "PROVIDER_FETCH_ERROR_DETECTED",
            message: "The agent detected provider fetch errors on this route.",
            providers: summary.fetchErrorProviders
        });
    }

    if (routePolicy.allowPeerFallback === true) {
        notices.push({
            severity: "info",
            code: "PEER_FALLBACK_AVAILABLE",
            message: "The current route policy allows peer assisted fallback."
        });
    }

    if (routePolicy.allowOriginFallback !== true) {
        notices.push({
            severity: "info",
            code: "ORIGIN_FALLBACK_BLOCKED_BY_POLICY",
            message: "Origin fallback remains blocked by route policy."
        });
    }

    notices.push({
        severity: "info",
        code: "ROUTE_SCOPE_RETAINED",
        message: "The recommendation stays scoped to the affected route.",
        routeKey: routeScope.routeKey
    });

    return notices;
}

function createAgentRecommendation(summary, failurePointSummary, routePolicy, routeScope) {
    const lastFailurePoint = failurePointSummary.lastFailurePoint;

    if (summary.attemptCount === 0 && failurePointSummary.count === 0) {
        return {
            id: "OBSERVE_ONLY_NO_ATTEMPTS",
            action: "OBSERVE_ONLY",
            confidence: "low",
            reason: "No provider attempts or failure points were available for analysis.",
            cooldownProviderNames: [],
            failureStage: null,
            failurePointCode: null,
            keepPeerFallback: routePolicy.allowPeerFallback,
            allowOriginFallback: routePolicy.allowOriginFallback,
            routeKey: routeScope.routeKey
        };
    }

    if (summary.failedProviders.length > 0 && routePolicy.allowPeerFallback === true) {
        return {
            id: "COOLDOWN_FAILED_PROVIDERS_KEEP_PEER",
            action: "COOLDOWN_FAILED_PROVIDERS_KEEP_PEER_FALLBACK",
            confidence: failurePointSummary.count > 0 ? "high" : "medium",
            reason: "The agent saw provider failures and recommends cooling down failed providers while keeping peer fallback enabled for this route.",
            cooldownProviderNames: summary.failedProviders,
            failureStage: lastFailurePoint?.stage || null,
            failurePointCode: lastFailurePoint?.code || null,
            keepPeerFallback: true,
            allowOriginFallback: routePolicy.allowOriginFallback,
            routeKey: routeScope.routeKey
        };
    }

    if (summary.failedProviders.length > 0 && routePolicy.allowOriginFallback === true) {
        return {
            id: "COOLDOWN_FAILED_PROVIDERS_ALLOW_ORIGIN_LAST",
            action: "COOLDOWN_FAILED_PROVIDERS_ALLOW_ORIGIN_LAST_RESORT",
            confidence: failurePointSummary.count > 0 ? "high" : "medium",
            reason: "The agent saw provider failures and recommends cooling down failed providers while preserving origin as a controlled last resort.",
            cooldownProviderNames: summary.failedProviders,
            failureStage: lastFailurePoint?.stage || null,
            failurePointCode: lastFailurePoint?.code || null,
            keepPeerFallback: routePolicy.allowPeerFallback,
            allowOriginFallback: true,
            routeKey: routeScope.routeKey
        };
    }

    if (summary.failedProviders.length > 0) {
        return {
            id: "COOLDOWN_FAILED_PROVIDERS_FAIL_CLOSED",
            action: "COOLDOWN_FAILED_PROVIDERS_FAIL_CLOSED",
            confidence: failurePointSummary.count > 0 ? "high" : "medium",
            reason: "The agent saw provider failures, but this route policy blocks both peer and origin fallback. The route should fail closed safely.",
            cooldownProviderNames: summary.failedProviders,
            failureStage: lastFailurePoint?.stage || null,
            failurePointCode: lastFailurePoint?.code || null,
            keepPeerFallback: false,
            allowOriginFallback: false,
            routeKey: routeScope.routeKey
        };
    }

    if (failurePointSummary.count > 0) {
        return {
            id: "OBSERVE_FAILURE_POINTS_ONLY",
            action: "OBSERVE_FAILURE_POINTS",
            confidence: "medium",
            reason: "The agent received failure points without failed provider attempts and recommends investigation before policy mutation.",
            cooldownProviderNames: [],
            failureStage: lastFailurePoint?.stage || null,
            failurePointCode: lastFailurePoint?.code || null,
            keepPeerFallback: routePolicy.allowPeerFallback,
            allowOriginFallback: routePolicy.allowOriginFallback,
            routeKey: routeScope.routeKey
        };
    }

    return {
        id: "OBSERVE_ONLY_ROUTE_HEALTHY",
        action: "OBSERVE_ONLY",
        confidence: "high",
        reason: "The route succeeded without provider failures. No policy change is recommended.",
        cooldownProviderNames: [],
        failureStage: null,
        failurePointCode: null,
        keepPeerFallback: routePolicy.allowPeerFallback,
        allowOriginFallback: routePolicy.allowOriginFallback,
        routeKey: routeScope.routeKey
    };
}

function uniqueNames(names) {
    return Array.from(new Set(names.filter(name => typeof name === "string" && name.length > 0)));
}
