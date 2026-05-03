const CACHE_NAME = "mgp-open-edge-segment-cache-v1";
const MANIFEST_CACHE_NAME = "mgp-open-edge-manifest-cache-v1";
const MAX_SEGMENT_CACHE_ITEMS = 256;

self.addEventListener("install", function(event) {
    self.skipWaiting();
});

self.addEventListener("activate", function(event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function(event) {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    if (isManifestRequest(url) === true) {
        event.respondWith(networkFirst(request, MANIFEST_CACHE_NAME));
        return;
    }

    if (isSegmentRequest(url) === true) {
        event.respondWith(cacheFirstWithRefresh(request, CACHE_NAME));
        return;
    }
});

function isManifestRequest(url) {
    return url.pathname.endsWith(".json") || url.pathname.includes("/manifest");
}

function isSegmentRequest(url) {
    return url.pathname.endsWith(".m4s") ||
        url.pathname.endsWith(".ts") ||
        url.pathname.endsWith(".mp4") ||
        url.pathname.includes("/segment/") ||
        url.pathname.includes("/video/");
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);

    try {
        const response = await fetch(request);

        if (response.ok === true) {
            await cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        const cached = await cache.match(request);

        if (cached !== undefined) {
            return cached;
        }

        throw error;
    }
}

async function cacheFirstWithRefresh(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    if (cached !== undefined) {
        refreshInBackground(request, cache);
        return cached;
    }

    const response = await fetch(request);

    if (response.ok === true) {
        await cache.put(request, response.clone());
        await trimCache(cacheName, MAX_SEGMENT_CACHE_ITEMS);
    }

    return response;
}

function refreshInBackground(request, cache) {
    fetch(request)
        .then(function(response) {
            if (response.ok === true) {
                return cache.put(request, response);
            }
            return null;
        })
        .catch(function() {
        });
}

async function trimCache(cacheName, maxItems) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    if (keys.length <= maxItems) {
        return;
    }

    const deleteCount = keys.length - maxItems;

    for (let i = 0; i < deleteCount; i += 1) {
        await cache.delete(keys[i]);
    }
}
