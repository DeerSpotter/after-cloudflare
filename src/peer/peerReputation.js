const MAX_SCORE = 1000;
const MIN_SCORE = -1000;

const peerScores = new Map();

export function recordPeerSuccess(peerId, latencyMs) {
    const entry = getEntry(peerId);
    entry.successes += 1;
    entry.latencyMs = rollingAverage(entry.latencyMs, latencyMs);
    entry.score = clamp(entry.score + 15, MIN_SCORE, MAX_SCORE);
}

export function recordPeerFailure(peerId) {
    const entry = getEntry(peerId);
    entry.failures += 1;
    entry.score = clamp(entry.score - 35, MIN_SCORE, MAX_SCORE);
}

export function recordPeerInvalidData(peerId) {
    const entry = getEntry(peerId);
    entry.invalidData += 1;
    entry.score = clamp(entry.score - 150, MIN_SCORE, MAX_SCORE);
}

export function getPeerScore(peerId) {
    return getEntry(peerId).score;
}

export function rankPeers(peers) {
    return peers
        .map(peer => ({
            ...peer,
            score: getPeerScore(peer.peerId)
        }))
        .sort((a, b) => b.score - a.score);
}

function getEntry(peerId) {
    let entry = peerScores.get(peerId);

    if (entry === undefined) {
        entry = {
            score: 0,
            successes: 0,
            failures: 0,
            invalidData: 0,
            latencyMs: null
        };

        peerScores.set(peerId, entry);
    }

    return entry;
}

function rollingAverage(current, value) {
    if (current === null) {
        return value;
    }

    return current * 0.7 + value * 0.3;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
