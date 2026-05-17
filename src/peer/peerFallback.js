export function createPeerFallbackResponse(request, providers, statusCode, routePolicy = null) {
    const url = new URL(request.url);
    const assetPath = url.pathname + url.search;

    return Response.json({
        protocol: "mgp-peer-fallback-v1",
        status: "cdn-routes-unavailable",
        statusCode: statusCode || 503,
        routePolicyId: routePolicy?.id || null,
        routeKey: routePolicy?.routeKey || null,
        assetPath: assetPath,
        peerLookup: createPeerLookupUrl(url),
        providersTried: providers.map(provider => provider.name),
        generatedAt: Date.now()
    }, {
        status: statusCode || 503,
        headers: createHeaders(routePolicy)
    });
}

function createPeerLookupUrl(url) {
    const lookup = new URL(url.origin + "/peer/lookup");
    lookup.searchParams.set("chunk", url.pathname);
    return lookup.toString();
}

function createHeaders(routePolicy) {
    const headers = {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-open-edge-route": "peer-fallback",
        "x-flareless-route": "peer-fallback"
    };

    if (routePolicy !== null) {
        headers["x-flareless-policy-id"] = routePolicy.id;
        headers["x-flareless-route-key"] = routePolicy.routeKey;
    }

    return headers;
}
