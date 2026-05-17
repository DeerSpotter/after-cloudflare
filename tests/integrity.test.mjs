import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSha256, sha256Hex, verifySha256 } from "../src/mgp/integrity.js";

test("sha256Hex returns stable lowercase SHA256", async () => {
    const digest = await sha256Hex("hello world");

    assert.equal(digest, "b94d27b9934d3e08a52e52d7da7dabfadeb6a770778cbc9c91a3c7d856559f");
});

test("verifySha256 accepts matching bytes", async () => {
    const bytes = new TextEncoder().encode("hello world");
    const expected = "b94d27b9934d3e08a52e52d7da7dabfadeb6a770778cbc9c91a3c7d856559f";

    assert.equal(await verifySha256(bytes, expected), true);
});

test("verifySha256 rejects mismatched bytes", async () => {
    const expected = "b94d27b9934d3e08a52e52d7da7dabfadeb6a770778cbc9c91a3c7d856559f";

    assert.equal(await verifySha256("tampered", expected), false);
});

test("normalizeSha256 rejects invalid hash values", () => {
    assert.equal(normalizeSha256("not-a-hash"), null);
    assert.equal(normalizeSha256("abc"), null);
    assert.equal(normalizeSha256(null), null);
});
