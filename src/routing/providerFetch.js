export async function fetchThroughProvider(request, provider) {
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

        return await fetch(routedRequest);
    } catch (error) {
        return null;
    }
}
