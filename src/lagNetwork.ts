import { Input, ServerEntityState } from "./entity";

class Message {

    payload: any;
    fromNetworkID: number;

    constructor(payload: any, fromNetworkID: number) {
        this.payload = payload;
        this.fromNetworkID = fromNetworkID;
    }
}

class TimedMessage {

    sendTS: number;
    recvTS: number;
    payload: Message;

    constructor(sendTS: number, recvTS: number, payload: Message) {
        this.sendTS = sendTS;
        this.recvTS = recvTS;
        this.payload = payload;
    }
}

export class NetworkState {

    lagMin: number = 0.0;
    lagMax: number = 0.0;
    dropChance: number = 0.0;
    dropCorrelation: number = 0.0;
    duplicateChance: number = 0.0;

    protected lastDropRoll: number = 0.0;

    set(lagMin: number, lagMax: number, dropChance: number, dropCorrelation: number, duplicateChance: number) {
        this.lagMin = lagMin;
        this.lagMax = lagMax;
        this.dropChance = dropChance;
        this.dropCorrelation = dropCorrelation;
        this.duplicateChance = duplicateChance;
    }

    copyFrom(src: NetworkState) {
        this.lagMin = src.lagMin;
        this.lagMax = src.lagMax;
        this.dropChance = src.dropChance;
        this.dropCorrelation = src.dropCorrelation;
        this.duplicateChance = src.duplicateChance;
    }

    randomLag(): number {
        this.lagMax = Math.max(this.lagMax, this.lagMin);
        return Math.floor(Math.random() * (this.lagMax - this.lagMin)) + this.lagMin;
    }

    shouldDrop(): boolean {
        let newRoll = Math.random();
        if (this.lastDropRoll <= this.dropChance) { // Drop correlation enabled only when last packet was dropped
            newRoll = this.lastDropRoll * this.dropCorrelation + newRoll * (1.0 - this.dropCorrelation);
        }
        this.lastDropRoll = newRoll;

        return newRoll <= this.dropChance;
    }

    shouldDuplicate(): boolean {
        return Math.random() <= this.duplicateChance;
    }
}

export class LagNetwork {

    debug: boolean = false;

    protected messages: Array<TimedMessage> = [];

    send(timestamp: number, state: NetworkState, payload: any, fromNetworkID: number) {
        if (!state.shouldDrop()) {
            this.directSend(new TimedMessage(timestamp, timestamp + state.randomLag(), new Message(payload, fromNetworkID)));

            if (state.shouldDuplicate()) {
                this.directSend(new TimedMessage(timestamp, timestamp + state.randomLag(), new Message(payload, fromNetworkID)));
            }
        }
    }

    protected directSend(message: TimedMessage) {
        this.messages.push(message);
    }

    receive(timestamp: number): Message | undefined {
        if (this.debug) console.log(this.messages.length); // Rudimentary estimation of bandwidth

        for (let i = 0; i < this.messages.length; i++) {
            let message = this.messages[i];
            
            if (message.recvTS <= timestamp) {
                this.messages.splice(i, 1);
                return message.payload;
            }
        }
    }
}
