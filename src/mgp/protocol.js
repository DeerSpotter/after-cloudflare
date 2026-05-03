export function createMgpRoutePacket(request, rankedProviders) {
    const url = new URL(request.url);

    return {
        protocol: "mgp-edge-v1",
        routeId: crypto.randomUUID(),
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
