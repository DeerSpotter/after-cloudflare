import assert from "node:assert/strict";
import test from "node:test";

import { PROVIDERS } from "../src/config/providers.js";
import { createMgpManifest } from "../src/mgp/protocol.js";

const HELLO_WORLD_SHA256 = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

test("manifest includes asset integrity fields", () => {
    const manifest = createMgpManifest("video/test/v1/chunk-0001.m4s", PROVIDERS, {
        sizeBytes: 11,
        sha256: HELLO_WORLD_SHA256
    });

    assert.equal(manifest.protocol, "mgp-manifest-v1");
    assert.equal(manifest.assetPath, "/video/test/v1/chunk-0001.m4s");
    assert.equal(manifest.integrity.algorithm, "sha256");
    assert.equal(manifest.integrity.sizeBytes, 11);
    assert.equal(manifest.integrity.sha256, HELLO_WORLD_SHA256);
    assert.equal(manifest.integrity.verified, true);
    assert.equal(manifest.sources.length, 3);
});

test("manifest normalizes and filters chunk integrity entries", () => {
    const manifest = createMgpManifest("/video/test/v1/master.m3u8", PROVIDERS, {
        chunks: [
            {
                index: 0,
                path: "video/test/v1/chunk-0001.m4s",
                offset: 0,
                sizeBytes: 11,
                sha256: HELLO_WORLD_SHA256.toUpperCase()
            },
            {
                index: 1,
                path: "video/test/v1/chunk-0002.m4s",
                offset: 11,
                sizeBytes: 11,
                sha256: "not-a-valid-hash"
            }
        ]
    });

    assert.equal(manifest.chunks.length, 1);
    assert.equal(manifest.chunks[0].index, 0);
    assert.equal(manifest.chunks[0].path, "/video/test/v1/chunk-0001.m4s");
    assert.equal(manifest.chunks[0].offset, 0);
    assert.equal(manifest.chunks[0].sizeBytes, 11);
    assert.equal(manifest.chunks[0].sha256, HELLO_WORLD_SHA256);
});

test("manifest marks integrity as unverified when hash is missing", () => {
    const manifest = createMgpManifest("/video/test/v1/chunk-0001.m4s", PROVIDERS);

    assert.equal(manifest.integrity.algorithm, "sha256");
    assert.equal(manifest.integrity.sizeBytes, null);
    assert.equal(manifest.integrity.sha256, null);
    assert.equal(manifest.integrity.verified, false);
});
