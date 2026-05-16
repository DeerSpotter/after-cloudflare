const DEFAULT_PROVIDER_TIMEOUT_MS = 1500;

export async function fetchThroughProvider(request, provider) {
    const timeoutMs = normalizeTimeoutMs(provider.timeoutMs);

    try {
        const sourceUrl = new URL(request.url);
        const providerUrl = new URL(provider.baseUrl);
        providerUrl.pathname = sourceUrl.pathname;
        providerUrl.search = sourceUrl.search;

        const headers = new Headers(request.headers);
        headers.set("x-open-edge-source-host", sourceUrl.host);
        headers.set("x-open-edge-provider", provider.name);

        const routedRequest = new Request(providerUrl.toString(), {
            method: request.method,
            headers: headers,
            body: request.body,
            redirect: "manual"
        });

        const result = await fetchWithTimeout(routedRequest, timeoutMs);

        if (result.timedOut === true) {
            return {
                ok: false,
                response: null,
                provider: provider.name,
                reason: "PROVIDER_TIMEOUT",
                timeoutMs: timeoutMs
            };
        }

        return {
            ok: true,
            response: result.response,
            provider: provider.name,
            reason: "PROVIDER_RESPONSE",
            timeoutMs: timeoutMs
        };
    } catch (error) {
        return {
            ok: false,
            response: null,
            provider: provider.name,
            reason: "PROVIDER_FETCH_ERROR",
            timeoutMs: timeoutMs
        };
    }
}

async function fetchWithTimeout(request, timeoutMs) {
    let timer = null;

    const timeoutPromise = new Promise(resolve => {
        timer = setTimeout(() => {
            resolve({
                timedOut: true,
                response: null
            });
        }, timeoutMs);
    });

    const fetchPromise = fetch(request).then(response => ({
        timedOut: false,
        response: response
    }));

    try {
        return await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
        clearTimeout(timer);
    }
}

function normalizeTimeoutMs(value) {
    const parsed = Number(value);

    if (Number.isFinite(parsed) === false || parsed <= 0) {
        return DEFAULT_PROVIDER_TIMEOUT_MS;
    }

    return Math.round(parsed);
}
