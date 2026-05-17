const DEFAULT_PROVIDER_TIMEOUT_MS = 1500;
const SAFE_FORWARD_HEADERS = new Set([
    "accept",
    "accept-encoding",
    "accept-language",
    "cache-control",
    "if-match",
    "if-modified-since",
    "if-none-match",
    "if-range",
    "if-unmodified-since",
    "range",
    "user-agent"
]);

export async function fetchThroughProvider(request, provider) {
    const timeoutMs = normalizeTimeoutMs(provider.timeoutMs);

    try {
        const sourceUrl = new URL(request.url);
        const providerUrl = new URL(provider.baseUrl);
        providerUrl.pathname = sourceUrl.pathname;
        providerUrl.search = sourceUrl.search;

        const headers = createProviderHeaders(request.headers, sourceUrl.host, provider.name);

        const routedRequestInit = {
            method: request.method,
            headers: headers,
            redirect: "manual"
        };

        if (request.method !== "GET" && request.method !== "HEAD") {
            routedRequestInit.body = request.body;
        }

        const routedRequest = new Request(providerUrl.toString(), routedRequestInit);
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
    const controller = new AbortController();
    let timer = null;

    const abortableRequest = new Request(request, {
        signal: controller.signal
    });

    try {
        const timeoutPromise = new Promise(resolve => {
            timer = setTimeout(() => {
                controller.abort("provider-timeout");
                resolve({
                    timedOut: true,
                    response: null
                });
            }, timeoutMs);
        });

        const fetchPromise = fetch(abortableRequest).then(response => ({
            timedOut: false,
            response: response
        })).catch(error => {
            if (controller.signal.aborted === true) {
                return {
                    timedOut: true,
                    response: null
                };
            }

            throw error;
        });

        return await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
        clearTimeout(timer);
    }
}

function createProviderHeaders(sourceHeaders, sourceHost, providerName) {
    const headers = new Headers();

    for (const [name, value] of sourceHeaders.entries()) {
        const normalizedName = name.toLowerCase();

        if (SAFE_FORWARD_HEADERS.has(normalizedName) === true) {
            headers.set(name, value);
        }
    }

    headers.set("x-open-edge-source-host", sourceHost);
    headers.set("x-open-edge-provider", providerName);

    return headers;
}

function normalizeTimeoutMs(value) {
    const parsed = Number(value);

    if (Number.isFinite(parsed) === false || parsed <= 0) {
        return DEFAULT_PROVIDER_TIMEOUT_MS;
    }

    return Math.round(parsed);
}
