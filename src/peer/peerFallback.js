export function createPeerFallbackResponse(request, providers, statusCode) {
    const url = new URL(request.url);
    const assetPath = url.pathname + url.search;

    return Response.json({
        protocol: "mgp-peer-fallback-v1",
        status: "cdn-routes-unavailable",
        statusCode: statusCode || 503,
        assetPath: assetPath,
        peerLookup: createPeerLookupUrl(url),
        providersTried: providers.map(provider => provider.name),
        generatedAt: Date.now()
    }, {
        status: statusCode || 503,
        headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-open-edge-route": "peer-fallback"
        }
    });
}

function createPeerLookupUrl(url) {
    const lookup = new URL(url.origin + "/peer/lookup");
    lookup.searchParams.set("chunk", url.pathname);
    return lookup.toString();
}
