export function createMgpRoutePacket(request, rankedProviders, routeScope = null) {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const routeKey = routeScope?.routeKey || "route:" + normalizeRoutePath(url.pathname);

    return {
        protocol: "mgp-edge-v1",
        routeId: requestId,
        requestId: requestId,
        routeKey: routeKey,
        method: request.method,
        path: url.pathname,
        createdAt: Date.now(),
        providers: rankedProviders.map(provider => provider.name)
    };
}

export function createMgpProviderSnapshot(providers, healthSnapshot) {
    return providers.map(provider => ({
        name: provider.name,
        enabled: provider.enabled === true,
        priority: provider.priority || 100,
        baseUrl: provider.baseUrl,
        health: healthSnapshot?.[provider.name] || null
    }));
}

export function createMgpManifest(assetPath, providers) {
    const normalizedPath = normalizeAssetPath(assetPath);

    return {
        protocol: "mgp-manifest-v1",
        assetPath: normalizedPath,
        generatedAt: Date.now(),
        sources: providers
            .filter(provider => provider.enabled === true)
            .map(provider => ({
                provider: provider.name,
                url: createProviderUrl(provider, normalizedPath)
            }))
    };
}

function createProviderUrl(provider, assetPath) {
    const url = new URL(provider.baseUrl);
    url.pathname = assetPath;
    return url.toString();
}

function normalizeAssetPath(value) {
    if (typeof value !== "string" || value.length === 0) {
        return "/";
    }

    if (value.startsWith("/")) {
        return value;
    }

    return "/" + value;
}

function normalizeRoutePath(path) {
    const normalizedPath = normalizeAssetPath(path);
    const slashIndex = normalizedPath.lastIndexOf("/");

    if (slashIndex <= 0) {
        return "/";
    }

    return normalizedPath.slice(0, slashIndex);
}
