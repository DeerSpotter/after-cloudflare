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

export function createMgpManifest(assetPath, providers, options = {}) {
    const normalizedPath = normalizeAssetPath(assetPath);
    const sizeBytes = normalizePositiveInteger(options.sizeBytes);
    const sha256 = normalizeSha256(options.sha256);

    return {
        protocol: "mgp-manifest-v1",
        assetPath: normalizedPath,
        generatedAt: Date.now(),
        integrity: {
            algorithm: "sha256",
            sizeBytes: sizeBytes,
            sha256: sha256,
            verified: sha256 !== null
        },
        chunks: normalizeChunks(options.chunks),
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

function normalizeChunks(value) {
    if (Array.isArray(value) === false) {
        return [];
    }

    return value.map(chunk => ({
        index: normalizePositiveInteger(chunk?.index),
        path: normalizeAssetPath(chunk?.path || "/"),
        offset: normalizePositiveInteger(chunk?.offset),
        sizeBytes: normalizePositiveInteger(chunk?.sizeBytes),
        sha256: normalizeSha256(chunk?.sha256)
    })).filter(chunk => chunk.index !== null && chunk.sizeBytes !== null && chunk.sha256 !== null);
}

function normalizePositiveInteger(value) {
    const parsed = Number(value);

    if (Number.isSafeInteger(parsed) === false || parsed < 0) {
        return null;
    }

    return parsed;
}

function normalizeSha256(value) {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim().toLowerCase();

    if (/^[a-f0-9]{64}$/.test(normalized) === false) {
        return null;
    }

    return normalized;
}
