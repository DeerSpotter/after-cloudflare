import worker from "../src/worker.js";
import { PROVIDERS } from "../src/config/providers.js";
import { resetHealthState } from "../src/routing/health.js";

resetHealthState();

for (const provider of PROVIDERS) {
    provider.timeoutMs = 25;
}

PROVIDERS[0].enabled = true;
PROVIDERS[1].enabled = true;
PROVIDERS[2].enabled = false;

const oldFetch = globalThis.fetch;
const attemptedUrls = [];

globalThis.fetch = async function(request) {
    attemptedUrls.push(request.url);

    if (request.url.includes("cdn-a.example.com")) {
        return new Promise(() => {});
    }

    if (request.url.includes("cdn-b.example.com")) {
        return new Response("ok from cdn-b", {
            status: 200,
            headers: {
                "content-type": "text/plain"
            }
        });
    }

    return new Response("unexpected provider", { status: 500 });
};

try {
    const response = await worker.fetch(new Request("https://edge.example.com/video/demo.m4s"), makeEnv(), {});
    const body = await response.text();

    const result = {
        request: "/video/demo.m4s",
        status: response.status,
        body: body,
        attemptedUrls: attemptedUrls,
        headers: {
            "x-flareless-provider": response.headers.get("x-flareless-provider"),
            "x-flareless-route-id": response.headers.get("x-flareless-route-id"),
            "x-flareless-reason": response.headers.get("x-flareless-reason"),
            "x-flareless-attempts": response.headers.get("x-flareless-attempts")
        }
    };

    console.log(JSON.stringify(result, null, 2));

    assertEqual(response.status, 200, "expected successful fallback response");
    assertEqual(body, "ok from cdn-b", "expected body from backup provider");
    assertEqual(response.headers.get("x-flareless-provider"), "cdn-b", "expected backup provider to win");
    assertEqual(response.headers.get("x-flareless-reason"), "PROVIDER_TIMEOUT_FAILOVER", "expected timeout failover reason");
    assertEqual(response.headers.get("x-flareless-attempts"), "cdn-a:PROVIDER_TIMEOUT,cdn-b:PROVIDER_SUCCESS", "expected timeout then success attempt chain");

    console.log("\nPASS: Flareless routed around a timed out provider.");
} finally {
    globalThis.fetch = oldFetch;
    resetHealthState();
}

function makeEnv() {
    return {
        MGP_SIGNAL: {
            idFromName(name) {
                return name;
            },
            get(id) {
                return {
                    async fetch() {
                        return new Response("stub websocket room " + id, { status: 200 });
                    }
                };
            }
        }
    };
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        console.error("FAIL: " + message);
        console.error("expected:", expected);
        console.error("actual:", actual);
        process.exitCode = 1;
    }
}
