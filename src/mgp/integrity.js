export async function sha256Hex(value) {
    const bytes = normalizeBytes(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);

    return [...new Uint8Array(digest)]
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

export async function verifySha256(value, expectedSha256) {
    const normalizedExpected = normalizeSha256(expectedSha256);

    if (normalizedExpected === null) {
        return false;
    }

    const actual = await sha256Hex(value);
    return actual === normalizedExpected;
}

export function normalizeSha256(value) {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim().toLowerCase();

    if (/^[a-f0-9]{64}$/.test(normalized) === false) {
        return null;
    }

    return normalized;
}

function normalizeBytes(value) {
    if (value instanceof Uint8Array) {
        return value;
    }

    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }

    if (typeof value === "string") {
        return new TextEncoder().encode(value);
    }

    throw new TypeError("value must be a string, Uint8Array, or ArrayBuffer");
}
