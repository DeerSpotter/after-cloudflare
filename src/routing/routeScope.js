export function createRouteScope(request) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const routePath = createRoutePath(path);
    const sessionId = normalizeScopePart(request.headers.get("x-flareless-session-id") || url.searchParams.get("session"));

    const scope = {
        path: path,
        routePath: routePath,
        routeKey: "route:" + routePath,
        chunkKey: "chunk:" + path,
        sessionKey: sessionId.length > 0 ? "session:" + sessionId : null
    };

    return scope;
}

export function createHealthLayers(routeScope) {
    const layers = [
        { scopeKey: "global", weight: 0.1 },
        { scopeKey: routeScope.routeKey, weight: 1 },
        { scopeKey: routeScope.chunkKey, weight: 2 }
    ];

    if (routeScope.sessionKey !== null) {
        layers.push({ scopeKey: routeScope.sessionKey, weight: 3 });
    }

    return layers;
}

function normalizePath(path) {
    if (typeof path !== "string" || path.length === 0) {
        return "/";
    }

    if (path.startsWith("/") === false) {
        return "/" + path;
    }

    return path;
}

function createRoutePath(path) {
    if (path === "/") {
        return "/";
    }

    const slashIndex = path.lastIndexOf("/");

    if (slashIndex <= 0) {
        return "/";
    }

    return path.slice(0, slashIndex);
}

function normalizeScopePart(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value
        .toLowerCase()
        .replace(/[^a-z0-9_.:/]/g, "_")
        .slice(0, 128);
}
