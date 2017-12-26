import { NetMessage, NetReliableMessage, NetIncomingMessage } from "./host";
import { SlidingArrayBuffer } from "./slidingBuffer";

export class StoredNetReliableMessage {

    msg: NetReliableMessage;
    sentTimestamp: number;
    resent = false;
    timesAcked: number = 0;

    constructor(msg: NetReliableMessage, curTimestamp: number) {
        this.msg = msg;
        this.sentTimestamp = curTimestamp;
    }
}

export class NetPeer {

    // Abstraction for IP address + port
    networkID: number;

    // Unique ID
    id: number;
    protected static curID = 0;

    // To allow other peers to detect duplicates
    msgSeqID: number = 0;

    // The received seqIDs from this peer, to detect duplicates
    recvSeqIDs: SlidingArrayBuffer<boolean> = new SlidingArrayBuffer(1024, (idx: number) => false);

    // Sequence number for reliability algorithm
    relSeqID: number = 0;

    // The reliable messages sent to this peer
    relSentMsgs: SlidingArrayBuffer<StoredNetReliableMessage> = new SlidingArrayBuffer(1024, (idx: number): (StoredNetReliableMessage | undefined) => undefined);

    // The reliable messages received from this peer
    relRecvMsgs: SlidingArrayBuffer<boolean> = new SlidingArrayBuffer(256, (idx: number) => false);

    // Packets are re-ordered here
    relRecvOrderMsgs: SlidingArrayBuffer<NetIncomingMessage> = new SlidingArrayBuffer(2048, (idx: number): (NetIncomingMessage | undefined) => undefined);
    relRecvOrderStartSeqID: number = 0;
    relOrderSeqID: number = 0;

    // Flag indicates if this peer was sent a reliable message this frame
    relSent: boolean = false;

    sendBuffer: Array<NetMessage> = [];

    // Disconnection and timeout
    waitingForDisconnect: boolean = false;
    protected lastReceivedTimestamp: number; // milliseconds
    protected lastReceivedTimestampSet: boolean = false;

    // Stats
    rtt: number = 0.0; // milliseconds
    protected smoothingFactor: number;

    constructor() {
        // Automatically assing a unique ID
        this.id = NetPeer.curID++;
        this.setRTTSmoothingFactor(64);
    }

    updateTimeout(timestamp: number) {
        this.lastReceivedTimestampSet = true;
        this.lastReceivedTimestamp = timestamp;
    }

    hasTimedOut(timestamp: number, timeout: number): boolean {
        // In case we never receive a message at all, we need
        // to also set this here
        if (!this.lastReceivedTimestampSet) {
            this.lastReceivedTimestampSet = true;
            this.lastReceivedTimestamp = timestamp;
            return false;
        }

        return timestamp - this.lastReceivedTimestamp >= timeout;
    }

    updateRTT(rtt: number) {
        // Exponential smoothing
        this.rtt = rtt * this.smoothingFactor + this.rtt * (1.0 - this.smoothingFactor);
    }

    setRTTSmoothingFactor(factor: number) {
        this.smoothingFactor = 2.0 / (1.0 + factor);
    }
}
