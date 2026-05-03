const REGION_DEFAULT = "global";
const FAILURE_PENALTY = 2500;
const BLOCK_PENALTY = 5000;
const LATENCY_WEIGHT = 1.0;
const COST_WEIGHT = 0.35;
const SUCCESS_BONUS = 250;

export function rankProvidersForProduction(providers, healthSnapshot, request) {
    const region = getRequestRegion(request);

    return providers
        .filter(provider => provider.enabled === true)
        .map(provider => {
            const health = healthSnapshot[provider.name] || {};
            const regional = provider.regions?.[region] || provider.regions?.[REGION_DEFAULT] || {};
            const latencyMs = Number.isFinite(health.latencyMs) ? health.latencyMs : regional.latencyMs || 350;
            const failures = Number.isFinite(health.failures) ? health.failures : 0;
            const blocked = health.blocked === true ? 1 : 0;
            const successCount = Number.isFinite(health.successes) ? health.successes : 0;
            const costScore = Number.isFinite(provider.costScore) ? provider.costScore : 100;
            const priority = Number.isFinite(provider.priority) ? provider.priority : 100;

            const score = priority
                + latencyMs * LATENCY_WEIGHT
                + failures * FAILURE_PENALTY
                + blocked * BLOCK_PENALTY
                + costScore * COST_WEIGHT
                - Math.min(successCount, 10) * SUCCESS_BONUS;

            return {
                ...provider,
                selectedRegion: region,
                productionScore: score,
                observedLatencyMs: latencyMs,
                observedFailures: failures,
                observedSuccesses: successCount
            };
        })
        .sort((left, right) => left.productionScore - right.productionScore);
}

export function getRequestRegion(request) {
    const cf = request.cf || {};
    const colo = typeof cf.colo === "string" ? cf.colo : "";
    const country = typeof cf.country === "string" ? cf.country : "";

    if (country === "US") {
        return "us";
    }

    if (["CA", "MX"].includes(country)) {
        return "north-america";
    }

    if (["GB", "IE", "FR", "DE", "NL", "ES", "IT", "SE", "NO", "FI", "DK", "PL"].includes(country)) {
        return "europe";
    }

    if (["JP", "KR", "SG", "IN", "AU", "NZ", "PH", "TH", "VN", "ID"].includes(country)) {
        return "asia-pacific";
    }

    if (colo.length > 0) {
        return "global";
    }

    return REGION_DEFAULT;
}
