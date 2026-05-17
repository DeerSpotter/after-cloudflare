const HEALTH = new Map();
const FAILURE_TTL_MS = 30000;
const GLOBAL_SCOPE_KEY = "global";

export function getHealthSnapshot(scopeKey = GLOBAL_SCOPE_KEY) {
    const now = Date.now();
    const output = {};

    for (const [key, state] of HEALTH.entries()) {
        const parsed = parseHealthKey(key);

        if (parsed.scopeKey !== scopeKey) {
            continue;
        }

        output[parsed.providerName] = createSnapshotState(state, now);
    }

    return output;
}

export function getLayeredHealthSnapshot(layers) {
    return layers.map(layer => ({
        scopeKey: layer.scopeKey,
        weight: normalizeWeight(layer.weight),
        providers: getHealthSnapshot(layer.scopeKey)
    }));
}

export function markProviderSuccess(scopeKeyOrName, nameOrLatencyMs, maybeLatencyMs) {
    const input = normalizeMutationInput(scopeKeyOrName, nameOrLatencyMs, maybeLatencyMs);
    const state = getState(input.scopeKey, input.providerName);
    const latencyMs = Number(input.value);

    state.successes += 1;
    state.lastLatencyMs = Number.isFinite(latencyMs) === true ? latencyMs : 0;
    state.avgLatencyMs = state.avgLatencyMs === 0 ? state.lastLatencyMs : Math.round(state.avgLatencyMs * 0.75 + state.lastLatencyMs * 0.25);
    state.lastError = null;

    if (state.failures > 0) {
        state.failures -= 1;
    }
}

export function markProviderFailure(scopeKeyOrName, nameOrReason, maybeReason) {
    const input = normalizeMutationInput(scopeKeyOrName, nameOrReason, maybeReason);
    const state = getState(input.scopeKey, input.providerName);
    const reason = String(input.value || "fetch-error");

    state.failures += 1;
    state.lastError = reason;

    if (state.failures >= 2 || reason.startsWith("blocked-")) {
        state.blockedUntil = Date.now() + FAILURE_TTL_MS;
    }
}

export function resetHealthState() {
    HEALTH.clear();
}

function createSnapshotState(state, now) {
    return {
        successes: state.successes,
        failures: state.failures,
        lastLatencyMs: state.lastLatencyMs,
        avgLatencyMs: state.avgLatencyMs,
        blockedUntil: Math.max(0, state.blockedUntil - now),
        lastError: state.lastError || null
    };
}

function getState(scopeKey, providerName) {
    const key = createHealthKey(scopeKey, providerName);
    let state = HEALTH.get(key);

    if (state === undefined) {
        state = {
            successes: 0,
            failures: 0,
            lastLatencyMs: 0,
            avgLatencyMs: 0,
            blockedUntil: 0,
            lastError: null
        };
        HEALTH.set(key, state);
    }

    return state;
}

function createHealthKey(scopeKey, providerName) {
    return normalizeScopeKey(scopeKey) + "|" + providerName;
}

function parseHealthKey(key) {
    const index = key.lastIndexOf("|");

    if (index < 0) {
        return {
            scopeKey: GLOBAL_SCOPE_KEY,
            providerName: key
        };
    }

    return {
        scopeKey: key.slice(0, index),
        providerName: key.slice(index + 1)
    };
}

function normalizeMutationInput(first, second, third) {
    if (third === undefined) {
        return {
            scopeKey: GLOBAL_SCOPE_KEY,
            providerName: String(first),
            value: second
        };
    }

    return {
        scopeKey: normalizeScopeKey(first),
        providerName: String(second),
        value: third
    };
}

function normalizeScopeKey(value) {
    if (typeof value !== "string" || value.length === 0) {
        return GLOBAL_SCOPE_KEY;
    }

    return value;
}

function normalizeWeight(value) {
    const parsed = Number(value);

    if (Number.isFinite(parsed) === false || parsed <= 0) {
        return 1;
    }

    return parsed;
}
