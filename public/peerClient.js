export class MgpPeerClient {
    constructor(options) {
        this.trackerUrl = options.trackerUrl;
        this.peerId = options.peerId || crypto.randomUUID();
        this.peers = new Map();
        this.channels = new Map();
    }

    async announceChunks(chunks) {
        await fetch(this.trackerUrl + "/peer/announce", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                peerId: this.peerId,
                chunks: chunks,
                capabilities: {
                    webrtc: true,
                    dataChannel: true
                }
            })
        });
    }

    async findPeers(chunkId) {
        const res = await fetch(this.trackerUrl + "/peer/lookup?chunk=" + encodeURIComponent(chunkId) + "&excludePeerId=" + this.peerId);
        return await res.json();
    }

    async connectToPeer(peerInfo) {
        const pc = new RTCPeerConnection();
        const channel = pc.createDataChannel("mgp");

        channel.onmessage = (event) => {
            console.log("Peer message", event.data);
        };

        this.channels.set(peerInfo.peerId, channel);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await fetch(this.trackerUrl + "/peer/signal", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                fromPeerId: this.peerId,
                toPeerId: peerInfo.peerId,
                type: "offer",
                payload: offer
            })
        });
    }
}
