const DEFAULT_ACTOR = "flareless-agent";
const DEFAULT_TTL_SECONDS = 900;
const recommendations = new Map();
const auditLog = [];
let recommendationCounter = 0;
let auditCounter = 0;

const TERMINAL_STATUSES = new Set(["approved", "rejected", "expired", "applied"]);

export function createRecommendationFromAgentReport(report = {}) {
    const routeTrace = report.routeTrace && typeof report.routeTrace === "object" ? report.routeTrace : {};
    const agentRecommendation = report.recommendation && typeof report.recommendation === "object" ? report.recommendation : {};
    const recommendationId = nextRecommendationId();
    const createdAt = nowIso();
    const recommendation = {
        recommendationId,
        requestId: String(routeTrace.requestId || "unknown-request"),
        routeKey: String(report.routeKey || routeTrace.routeKey || agentRecommendation.routeKey || "route:/"),
        policyId: String(report.policyId || routeTrace.policyId || "unknown-policy"),
        status: "pending",
        severity: highestSeverity(report.notices),
        summary: String(agentRecommendation.reason || "The agent produced a route recommendation."),
        reasonCodes: createReasonCodes(report, agentRecommendation),
        proposedAction: createProposedAction(report, agentRecommendation),
        sourceRecommendation: {
            id: String(agentRecommendation.id || "NO_RECOMMENDATION"),
            action: String(agentRecommendation.action || "OBSERVE_ONLY"),
            confidence: String(agentRecommendation.confidence || "unknown")
        },
        createdAt,
        updatedAt: createdAt
    };

    recommendations.set(recommendationId, recommendation);
    appendAuditEvent({
        recommendationId,
        actor: DEFAULT_ACTOR,
        action: "created",
        note: "Agent recommendation stored as pending operator review."
    });

    return clone(recommendation);
}

export function listRecommendations() {
    return Array.from(recommendations.values()).map(clone);
}

export function getRecommendation(recommendationId) {
    const recommendation = recommendations.get(String(recommendationId || ""));
    return recommendation ? clone(recommendation) : null;
}

export function approveRecommendation(recommendationId, decision = {}) {
    const recommendation = requireRecommendation(recommendationId);
    const operator = requireOperator(decision);
    const note = normalizeDecisionNote(decision.note);

    assertPending(recommendation, "approve");
    recommendation.status = "approved";
    recommendation.updatedAt = nowIso();
    appendAuditEvent({
        recommendationId: recommendation.recommendationId,
        actor: operator,
        action: "approved",
        note
    });

    return clone(recommendation);
}

export function rejectRecommendation(recommendationId, decision = {}) {
    const recommendation = requireRecommendation(recommendationId);
    const operator = requireOperator(decision);
    const note = normalizeDecisionNote(decision.note);

    assertPending(recommendation, "reject");
    recommendation.status = "rejected";
    recommendation.updatedAt = nowIso();
    appendAuditEvent({
        recommendationId: recommendation.recommendationId,
        actor: operator,
        action: "rejected",
        note
    });

    return clone(recommendation);
}

export function listAuditEvents() {
    return auditLog.map(clone);
}

export function resetRecommendationLifecycleForTests() {
    recommendations.clear();
    auditLog.length = 0;
    recommendationCounter = 0;
    auditCounter = 0;
}

export function lifecycleErrorResponse(error) {
    const status = Number.isFinite(error?.status) ? error.status : 500;
    return {
        status,
        body: {
            error: error instanceof Error ? error.message : "unknown lifecycle error",
            code: error?.code || "LIFECYCLE_ERROR"
        }
    };
}

function createProposedAction(report, agentRecommendation) {
    const routeKey = String(report.routeKey || agentRecommendation.routeKey || "route:/");
    return {
        type: "policy_annotation",
        scope: "route",
        routeKey,
        change: {
            agentAction: String(agentRecommendation.action || "OBSERVE_ONLY"),
            cooldownProviderNames: Array.isArray(agentRecommendation.cooldownProviderNames) ? [...agentRecommendation.cooldownProviderNames] : [],
            keepPeerFallback: agentRecommendation.keepPeerFallback === true,
            allowOriginFallback: agentRecommendation.allowOriginFallback === true,
            ttlSeconds: DEFAULT_TTL_SECONDS
        }
    };
}

function createReasonCodes(report, agentRecommendation) {
    const noticeCodes = Array.isArray(report.notices)
        ? report.notices.map(notice => notice?.code).filter(code => typeof code === "string" && code.length > 0)
        : [];
    const recommendationCodes = [agentRecommendation.action, agentRecommendation.failurePointCode]
        .filter(code => typeof code === "string" && code.length > 0);
    return Array.from(new Set([...noticeCodes, ...recommendationCodes]));
}

function highestSeverity(notices) {
    if (Array.isArray(notices) === false || notices.length === 0) {
        return "info";
    }

    const severities = notices.map(notice => notice?.severity);
    if (severities.includes("error")) {
        return "error";
    }
    if (severities.includes("warning")) {
        return "warning";
    }
    return "info";
}

function requireRecommendation(recommendationId) {
    const recommendation = recommendations.get(String(recommendationId || ""));
    if (!recommendation) {
        throw lifecycleError("RECOMMENDATION_NOT_FOUND", "Recommendation was not found.", 404);
    }
    return recommendation;
}

function requireOperator(decision) {
    const operator = typeof decision?.operator === "string" ? decision.operator.trim() : "";
    if (operator.length === 0) {
        throw lifecycleError("OPERATOR_REQUIRED", "Operator is required for recommendation decisions.", 400);
    }
    return operator;
}

function normalizeDecisionNote(note) {
    return typeof note === "string" && note.trim().length > 0 ? note.trim() : "No decision note provided.";
}

function assertPending(recommendation, action) {
    if (recommendation.status !== "pending") {
        const terminal = TERMINAL_STATUSES.has(recommendation.status) ? recommendation.status : "non-pending";
        throw lifecycleError(
            "INVALID_RECOMMENDATION_TRANSITION",
            `Cannot ${action} recommendation because it is already ${terminal}.`,
            409
        );
    }
}

function appendAuditEvent(input) {
    const event = {
        eventId: nextAuditId(),
        recommendationId: String(input.recommendationId || "unknown-recommendation"),
        actor: String(input.actor || DEFAULT_ACTOR),
        action: String(input.action || "unknown"),
        note: String(input.note || ""),
        createdAt: nowIso()
    };
    auditLog.push(event);
    return event;
}

function lifecycleError(code, message, status) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function nextRecommendationId() {
    recommendationCounter += 1;
    return "rec_" + String(recommendationCounter).padStart(6, "0");
}

function nextAuditId() {
    auditCounter += 1;
    return "audit_" + String(auditCounter).padStart(6, "0");
}

function nowIso() {
    return new Date().toISOString();
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
