const DEFAULT_ASSET = "default-asset";
const DEFAULT_REGION = "global";
const DEFAULT_BUCKETS = 32;

export function resolveSignalRoomName(request) {
    const url = new URL(request.url);
    const assetId = normalizeRoomPart(url.searchParams.get("asset"), DEFAULT_ASSET);
    const region = normalizeRoomPart(url.searchParams.get("region"), getRegionFromRequest(request));
    const peerId = normalizeRoomPart(url.searchParams.get("peerId"), "anonymous");
    const bucketCount = getBucketCount(url.searchParams.get("buckets"));
    const bucket = stableBucket(assetId + ":" + region + ":" + peerId, bucketCount);

    return "asset=" + assetId + ":region=" + region + ":bucket=" + bucket;
}

export function createRoomInfo(request) {
    const url = new URL(request.url);
    const assetId = normalizeRoomPart(url.searchParams.get("asset"), DEFAULT_ASSET);
    const region = normalizeRoomPart(url.searchParams.get("region"), getRegionFromRequest(request));
    const peerId = normalizeRoomPart(url.searchParams.get("peerId"), "anonymous");
    const bucketCount = getBucketCount(url.searchParams.get("buckets"));
    const bucket = stableBucket(assetId + ":" + region + ":" + peerId, bucketCount);

    return {
        protocol: "mgp-signal-v1",
        assetId: assetId,
        region: region,
        peerId: peerId,
        bucket: bucket,
        bucketCount: bucketCount,
        roomName: "asset=" + assetId + ":region=" + region + ":bucket=" + bucket
    };
}

function getRegionFromRequest(request) {
    const cf = request.cf || {};
    const country = typeof cf.country === "string" ? cf.country : "";

    if (country === "US") {
        return "us";
    }

    if (["CA", "MX"].includes(country)) {
        return "north-america";
    }

    if (["GB", "IE", "FR", "DE", "NL", "ES", "IT", "SE", "NO", "FI", "DK", "PL"].includes(country)) {
        return "europe";
    }

    if (["JP", "KR", "SG", "IN", "AU", "NZ", "PH", "TH", "VN", "ID"].includes(country)) {
        return "asia-pacific";
    }

    return DEFAULT_REGION;
}

function getBucketCount(value) {
    const parsed = Number.parseInt(value || "", 10);

    if (Number.isFinite(parsed) === false || parsed < 1) {
        return DEFAULT_BUCKETS;
    }

    return Math.min(parsed, 256);
}

function stableBucket(value, bucketCount) {
    let hash = 2166136261;

    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return Math.abs(hash >>> 0) % bucketCount;
}

function normalizeRoomPart(value, fallback) {
    if (typeof value !== "string") {
        return fallback;
    }

    const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_.]/g, "_").slice(0, 96);

    if (cleaned.length === 0) {
        return fallback;
    }

    return cleaned;
}
