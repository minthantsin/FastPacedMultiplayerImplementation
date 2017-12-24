import { LagNetwork } from "./lagNetwork";
import { NetHost, NetIncomingMessage } from "./netlib/host";

export class Host {

    // Simulated network connection
    netHost: NetHost = new NetHost();
    network: LagNetwork = new LagNetwork();
    networkID: number; // Unique ID per host (IP address + port abstraction)
    protected static curID = 0;

    // Update timer
    updateRate: number;
    protected updateInterval: number;
    protected lastTS: number;

    // UI
    protected canvas: HTMLCanvasElement;
    protected status: HTMLElement;

    initialize(canvas: HTMLCanvasElement, status: HTMLElement) {
        this.canvas = canvas;
        this.status = status;

        // Automatically assing a unique ID
        this.networkID = Host.curID++;
    }

    setUpdateRate(hz: number) {
        this.updateRate = hz;

        clearInterval(this.updateInterval);
        this.updateInterval = setInterval(
                (function(self) { return function() { self.update(); }; })(this),
                1000 / this.updateRate
            );
    }

    update() {
        
    }

    protected pollMessages(timestamp: number): Array<NetIncomingMessage> {
        // Get messages from LagNetwork layer
        let messages = [];
        while (true) {
            let message = this.network.receive(timestamp);
            if (!message) {
                break;
            }
            messages.push(message);
        }

        // Pass them to our NetHost layer for processing
        // NetHost can discard a message or put one on hold until
        // an earlier one arrives.
        messages.forEach(message => {
            this.netHost.enqueueRecv(message.payload, message.fromNetworkID);
        });

        return this.netHost.getRecvBuffer();
    }
}
