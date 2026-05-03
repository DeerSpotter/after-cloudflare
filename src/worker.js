const PROVIDERS = [
    {
        name: "cdn-a",
        baseUrl: "https://cdn-a.example.com",
        priority: 1,
        enabled: true
    },
    {
        name: "cdn-b",
        baseUrl: "https://cdn-b.example.com",
        priority: 2,
        enabled: true
    },
    {
        name: "cdn-c",
        baseUrl: "https://cdn-c.example.com",
        priority: 3,
        enabled: true
    }
];

const BLOCK_STATUS_CODES = new Set([403, 404, 429, 500, 502, 503, 504]);

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health") {
            return new Response("ok", { status: 200 });
        }

        const response = await routeRequest(request);

        if (response !== null) {
            return response;
        }

        return new Response("No healthy CDN route available", { status: 503 });
    }
};

async function routeRequest(request) {
    const originalUrl = new URL(request.url);

    const providers = PROVIDERS
        .filter(p => p.enabled)
        .sort((a, b) => a.priority - b.priority);

    for (const provider of providers) {
        const providerUrl = new URL(provider.baseUrl);
        providerUrl.pathname = originalUrl.pathname;
        providerUrl.search = originalUrl.search;

        try {
            const res = await fetch(providerUrl.toString(), {
                method: request.method,
                headers: request.headers
            });

            if (!BLOCK_STATUS_CODES.has(res.status)) {
                const headers = new Headers(res.headers);
                headers.set("x-open-edge-provider", provider.name);
                return new Response(res.body, {
                    status: res.status,
                    headers
                });
            }
        } catch (e) {
            continue;
        }
    }

    return null;
}
