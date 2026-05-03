import http from "node:http";
import worker from "../src/worker.js";

const PORT = Number.parseInt(process.env.PORT || "8787", 10);

const env = {
    MGP_SIGNAL: {
        idFromName(name) {
            return name;
        },
        get(id) {
            return {
                async fetch(request) {
                    return new Response(JSON.stringify({
                        protocol: "mgp-local-signal-stub-v1",
                        status: "websocket-not-supported-in-node-runner",
                        room: id,
                        requestUrl: request.url
                    }), {
                        status: 501,
                        headers: {
                            "content-type": "application/json",
                            "cache-control": "no-store"
                        }
                    });
                }
            };
        }
    }
};

const server = http.createServer(async (incoming, outgoing) => {
    try {
        const request = await toFetchRequest(incoming);
        const response = await worker.fetch(request, env, {
            waitUntil() {
            },
            passThroughOnException() {
            }
        });

        await writeNodeResponse(outgoing, response);
    } catch (error) {
        outgoing.writeHead(500, {
            "content-type": "application/json",
            "cache-control": "no-store"
        });
        outgoing.end(JSON.stringify({
            status: "local-edge-error",
            message: error?.message || String(error)
        }));
    }
});

server.listen(PORT, "127.0.0.1", () => {
    console.log("Open Edge Router local runner");
    console.log("Listening on http://127.0.0.1:" + PORT);
    console.log("Try http://127.0.0.1:" + PORT + "/health");
    console.log("Try http://127.0.0.1:" + PORT + "/manifest?path=/video/test/v1/seg_00001.m4s");
    console.log("Try http://127.0.0.1:" + PORT + "/peer/room-info?asset=test&peerId=peerA");
});

async function toFetchRequest(incoming) {
    const url = "http://127.0.0.1:" + PORT + incoming.url;
    const headers = new Headers();

    for (const [key, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                headers.append(key, item);
            }
        } else if (value !== undefined) {
            headers.set(key, value);
        }
    }

    const method = incoming.method || "GET";
    const hasBody = method !== "GET" && method !== "HEAD";

    return new Request(url, {
        method: method,
        headers: headers,
        body: hasBody ? incoming : undefined,
        duplex: hasBody ? "half" : undefined
    });
}

async function writeNodeResponse(outgoing, response) {
    const headers = {};

    response.headers.forEach((value, key) => {
        headers[key] = value;
    });

    outgoing.writeHead(response.status, headers);

    if (response.body === null) {
        outgoing.end();
        return;
    }

    const arrayBuffer = await response.arrayBuffer();
    outgoing.end(Buffer.from(arrayBuffer));
}
