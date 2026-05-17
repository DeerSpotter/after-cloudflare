const DEFAULT_ROUTE_POLICY = {
    id: "default-public-static",
    pathPrefix: "/",
    providerNames: null,
    allowPeerFallback: true,
    allowOriginFallback: false,
    providerTimeoutMs: null,
    healthScope: "route"
};

const ROUTE_POLICIES = [
    {
        id: "video-public-peer-first",
        pathPrefix: "/video/",
        providerNames: null,
        allowPeerFallback: true,
        allowOriginFallback: false,
        providerTimeoutMs: null,
        healthScope: "route"
    },
    {
        id: "private-no-fallback",
        pathPrefix: "/private/",
        providerNames: null,
        allowPeerFallback: false,
        allowOriginFallback: false,
        providerTimeoutMs: null,
        healthScope: "route"
    },
    {
        id: "origin-fallback-allowed",
        pathPrefix: "/origin-allowed/",
        providerNames: null,
        allowPeerFallback: false,
        allowOriginFallback: true,
        providerTimeoutMs: null,
        healthScope: "route"
    }
];

export function resolveRoutePolicy(routeScope) {
    const path = routeScope?.path || "/";
    const selectedPolicy = ROUTE_POLICIES
        .filter(policy => path.startsWith(policy.pathPrefix))
        .sort((left, right) => right.pathPrefix.length - left.pathPrefix.length)[0] || DEFAULT_ROUTE_POLICY;

    return {
        id: selectedPolicy.id,
        routeKey: routeScope?.routeKey || "route:/",
        pathPrefix: selectedPolicy.pathPrefix,
        providerNames: selectedPolicy.providerNames,
        allowPeerFallback: selectedPolicy.allowPeerFallback === true,
        allowOriginFallback: selectedPolicy.allowOriginFallback === true,
        providerTimeoutMs: selectedPolicy.providerTimeoutMs,
        healthScope: selectedPolicy.healthScope || "route"
    };
}

export function applyRoutePolicyToProviders(providers, routePolicy) {
    if (Array.isArray(routePolicy.providerNames) === false || routePolicy.providerNames.length === 0) {
        return providers;
    }

    const allowedProviders = new Set(routePolicy.providerNames);

    return providers.filter(provider => allowedProviders.has(provider.name));
}
