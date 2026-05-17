export function selectProviders(providers, healthSnapshot) {
    const healthLayers = normalizeHealthLayers(healthSnapshot);

    return providers
        .filter(provider => provider.enabled === true)
        .map(provider => ({
            provider: provider,
            score: scoreProvider(provider, healthLayers)
        }))
        .sort((left, right) => left.score - right.score)
        .map(entry => entry.provider);
}

function scoreProvider(provider, healthLayers) {
    const priorityScore = (provider.priority || 100) * 100;
    const costScore = (provider.costWeight || 1) * 25;
    let healthScore = 0;

    for (const layer of healthLayers) {
        healthScore += scoreHealth(layer.providers[provider.name], layer.weight);
    }

    return priorityScore + costScore + healthScore;
}

function scoreHealth(health, weight) {
    if (health === undefined) {
        return 0;
    }

    const blockedPenalty = health.blockedUntil > 0 ? 100000 * weight : 0;
    const failurePenalty = (health.failures || 0) * 500 * weight;
    const latencyPenalty = (health.avgLatencyMs || health.lastLatencyMs || 0) * weight;
    const successBonus = Math.min((health.successes || 0) * 10 * weight, 200 * weight);

    return blockedPenalty + failurePenalty + latencyPenalty - successBonus;
}

function normalizeHealthLayers(healthSnapshot) {
    if (Array.isArray(healthSnapshot) === true) {
        return healthSnapshot.map(layer => ({
            providers: layer.providers || {},
            weight: normalizeWeight(layer.weight)
        }));
    }

    return [{
        providers: healthSnapshot || {},
        weight: 1
    }];
}

function normalizeWeight(value) {
    const parsed = Number(value);

    if (Number.isFinite(parsed) === false || parsed <= 0) {
        return 1;
    }

    return parsed;
}
