export function selectProviders(providers, healthSnapshot) {
    const now = Date.now();

    return providers
        .filter(provider => provider.enabled === true)
        .map(provider => ({
            provider: provider,
            score: scoreProvider(provider, healthSnapshot?.[provider.name], now)
        }))
        .sort((left, right) => left.score - right.score)
        .map(entry => entry.provider);
}

function scoreProvider(provider, health, now) {
    const priorityScore = (provider.priority || 100) * 100;
    const costScore = (provider.costWeight || 1) * 25;

    if (health === undefined) {
        return priorityScore + costScore;
    }

    const blockedPenalty = health.blockedUntil > 0 ? 100000 : 0;
    const failurePenalty = (health.failures || 0) * 500;
    const latencyPenalty = health.avgLatencyMs || health.lastLatencyMs || 0;
    const successBonus = Math.min((health.successes || 0) * 10, 200);

    return priorityScore + costScore + blockedPenalty + failurePenalty + latencyPenalty - successBonus;
}
