import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSha256, sha256Hex, verifySha256 } from "../src/mgp/integrity.js";

const HELLO_WORLD_SHA256 = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

test("sha256Hex returns stable lowercase SHA256", async () => {
    const digest = await sha256Hex("hello world");

    assert.equal(digest, HELLO_WORLD_SHA256);
});

test("verifySha256 accepts matching bytes", async () => {
    const bytes = new TextEncoder().encode("hello world");

    assert.equal(await verifySha256(bytes, HELLO_WORLD_SHA256), true);
});

test("verifySha256 rejects mismatched bytes", async () => {
    assert.equal(await verifySha256("tampered", HELLO_WORLD_SHA256), false);
});

test("normalizeSha256 rejects invalid hash values", () => {
    assert.equal(normalizeSha256("not-a-hash"), null);
    assert.equal(normalizeSha256("abc"), null);
    assert.equal(normalizeSha256(null), null);
});
