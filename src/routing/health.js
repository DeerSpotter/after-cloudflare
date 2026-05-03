const HEALTH = new Map();
const FAILURE_TTL_MS = 30000;

export function getHealthSnapshot() {
    const now = Date.now();
    const output = {};

    for (const [name, state] of HEALTH.entries()) {
        output[name] = {
            successes: state.successes,
            failures: state.failures,
            lastLatencyMs: state.lastLatencyMs,
            avgLatencyMs: state.avgLatencyMs,
            blockedUntil: Math.max(0, state.blockedUntil - now),
            lastError: state.lastError || null
        };
    }

    return output;
}

export function markProviderSuccess(name, latencyMs) {
    const state = getState(name);
    state.successes += 1;
    state.lastLatencyMs = latencyMs;
    state.avgLatencyMs = state.avgLatencyMs === 0 ? latencyMs : Math.round(state.avgLatencyMs * 0.75 + latencyMs * 0.25);
    state.lastError = null;

    if (state.failures > 0) {
        state.failures -= 1;
    }
}

export function markProviderFailure(name, reason) {
    const state = getState(name);
    state.failures += 1;
    state.lastError = reason;

    if (state.failures >= 2 || String(reason).startsWith("blocked-")) {
        state.blockedUntil = Date.now() + FAILURE_TTL_MS;
    }
}

function getState(name) {
    let state = HEALTH.get(name);

    if (state === undefined) {
        state = {
            successes: 0,
            failures: 0,
            lastLatencyMs: 0,
            avgLatencyMs: 0,
            blockedUntil: 0,
            lastError: null
        };
        HEALTH.set(name, state);
    }

    return state;
}
