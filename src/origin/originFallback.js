export function createOriginFallbackResponse(request, routePolicy, providers, statusCode = 200) {
    const url = new URL(request.url);
    const assetPath = url.pathname + url.search;

    return Response.json({
        protocol: "mgp-origin-fallback-v1",
        status: "origin-fallback-allowed",
        statusCode: statusCode,
        routePolicyId: routePolicy.id,
        routeKey: routePolicy.routeKey,
        assetPath: assetPath,
        providersTried: providers.map(provider => provider.name),
        generatedAt: Date.now()
    }, {
        status: statusCode,
        headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-flareless-route": "origin-fallback",
            "x-flareless-policy-id": routePolicy.id,
            "x-flareless-route-key": routePolicy.routeKey
        }
    });
}

export function createFallbackBlockedResponse(request, routePolicy, providers, statusCode = 503) {
    const url = new URL(request.url);
    const assetPath = url.pathname + url.search;

    return Response.json({
        protocol: "mgp-route-policy-v1",
        status: "fallback-blocked-by-policy",
        statusCode: statusCode,
        routePolicyId: routePolicy.id,
        routeKey: routePolicy.routeKey,
        assetPath: assetPath,
        allowPeerFallback: routePolicy.allowPeerFallback,
        allowOriginFallback: routePolicy.allowOriginFallback,
        providersTried: providers.map(provider => provider.name),
        generatedAt: Date.now()
    }, {
        status: statusCode,
        headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-flareless-route": "fallback-blocked",
            "x-flareless-policy-id": routePolicy.id,
            "x-flareless-route-key": routePolicy.routeKey
        }
    });
}
