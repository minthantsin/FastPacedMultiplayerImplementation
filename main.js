var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
///////////////////////////////////////////////////////////////////////////////
// Collections
define("entity", ["require", "exports"], function (require, exports) {
    "use strict";
    exports.__esModule = true;
    ///////////////////////////////////////////////////////////////////////////////
    // Entity: Base entity
    var Input = /** @class */ (function () {
        function Input() {
        }
        return Input;
    }());
    exports.Input = Input;
    var Entity = /** @class */ (function () {
        function Entity() {
            this.x = 0;
            this.speed = 2;
            this.lastServerFrameID = -1;
        }
        Entity.prototype.applyInput = function (input) {
            this.x += input.pressTime * this.speed;
        };
        return Entity;
    }());
    exports.Entity = Entity;
    ///////////////////////////////////////////////////////////////////////////////
    // LocalEntity: Represents the player on the client
    var LocalEntity = /** @class */ (function (_super) {
        __extends(LocalEntity, _super);
        function LocalEntity() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.inputSequenceNumber = 0;
            _this.pendingInputs = [];
            return _this;
        }
        LocalEntity.prototype.incrementSequenceNumber = function () {
            return this.inputSequenceNumber++;
        };
        LocalEntity.prototype.numberOfPendingInputs = function () {
            return this.pendingInputs.length;
        };
        LocalEntity.prototype.saveInput = function (input) {
            this.pendingInputs.push(input);
        };
        LocalEntity.prototype.dropInputs = function () {
            this.pendingInputs = [];
        };
        LocalEntity.prototype.reconcile = function (state) {
            // Set authoritative position
            // A possible improvement for a real game would be to smooth this out
            this.x = state.position;
            // Server Reconciliation. Re-apply all the inputs not yet processed by
            // the server.
            var j = 0;
            while (j < this.pendingInputs.length) {
                var input = this.pendingInputs[j];
                if (input.inputSequenceNumber <= state.lastProcessedInput) {
                    // Already processed. Its effect is already taken into account into the world update
                    // we just got, so we can drop it.
                    this.pendingInputs.splice(j, 1);
                }
                else {
                    // Not processed by the server yet. Re-apply it.
                    this.applyInput(input);
                    j++;
                }
            }
        };
        return LocalEntity;
    }(Entity));
    exports.LocalEntity = LocalEntity;
    ///////////////////////////////////////////////////////////////////////////////
    // RemoteEntity: Represents the other players on the client
    var InterpolationPosition = /** @class */ (function () {
        function InterpolationPosition(timestamp, position) {
            this.timestamp = timestamp;
            this.position = position;
        }
        return InterpolationPosition;
    }());
    exports.InterpolationPosition = InterpolationPosition;
    var RemoteEntity = /** @class */ (function (_super) {
        __extends(RemoteEntity, _super);
        function RemoteEntity() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.positionBuffer = [];
            return _this;
        }
        RemoteEntity.prototype.addPosition = function (position) {
            this.positionBuffer.push(position);
        };
        RemoteEntity.prototype.interpolate = function (renderTimestamp) {
            // Find the two authoritative positions surrounding the rendering timestamp
            var buffer = this.positionBuffer;
            // Drop older positions
            while (buffer.length >= 2 && buffer[1].timestamp <= renderTimestamp) {
                buffer.shift();
            }
            // Interpolate between the two surrounding authoritative positions
            if (buffer.length >= 2 && buffer[0].timestamp <= renderTimestamp && renderTimestamp <= buffer[1].timestamp) {
                var x0 = buffer[0].position;
                var x1 = buffer[1].position;
                var t0 = buffer[0].timestamp;
                var t1 = buffer[1].timestamp;
                this.x = x0 + (x1 - x0) * (renderTimestamp - t0) / (t1 - t0);
            }
            else if (buffer.length == 1) {
                var x = buffer[0].position;
                this.x = x;
            }
        };
        return RemoteEntity;
    }(Entity));
    exports.RemoteEntity = RemoteEntity;
    ///////////////////////////////////////////////////////////////////////////////
    // ServerEntity: Represents the players on the server
    var ServerEntityState = /** @class */ (function () {
        function ServerEntityState(entityID, position, lastProcessedInput) {
            this.entityID = entityID;
            this.position = position;
            this.lastProcessedInput = lastProcessedInput;
        }
        return ServerEntityState;
    }());
    exports.ServerEntityState = ServerEntityState;
    var ServerEntity = /** @class */ (function (_super) {
        __extends(ServerEntity, _super);
        function ServerEntity() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.lastProcessedInput = 0;
            return _this;
        }
        ServerEntity.prototype.getLastProcessedInput = function () {
            return this.lastProcessedInput;
        };
        ServerEntity.prototype.constructState = function () {
            return new ServerEntityState(this.entityID, this.x, this.lastProcessedInput);
        };
        // Check whether this input seems to be valid (e.g. "make sense" according
        // to the physical rules of the World)
        ServerEntity.prototype.validateInput = function (input) {
            if (Math.abs(input.pressTime) > 1.0 / 40.0) {
                return false;
            }
            return true;
        };
        ServerEntity.prototype.processInput = function (input) {
            // Update the state of the entity, based on its input
            // We just ignore inputs that don't look valid; this is what prevents clients from cheating
            if (this.validateInput(input)) {
                this.applyInput(input);
                this.lastProcessedInput = input.inputSequenceNumber;
            }
        };
        return ServerEntity;
    }(Entity));
    exports.ServerEntity = ServerEntity;
});
define("lagNetwork", ["require", "exports"], function (require, exports) {
    "use strict";
    exports.__esModule = true;
    var Message = /** @class */ (function () {
        function Message(payload, fromNetworkID) {
            this.payload = payload;
            this.fromNetworkID = fromNetworkID;
        }
        return Message;
    }());
    var TimedMessage = /** @class */ (function () {
        function TimedMessage(recvTS, payload) {
            this.recvTS = recvTS;
            this.payload = payload;
        }
        return TimedMessage;
    }());
    var NetworkState = /** @class */ (function () {
        function NetworkState() {
            this.lagMin = 0.0;
            this.lagMax = 0.0;
            this.dropChance = 0.0;
            this.dropCorrelation = 0.0;
            this.duplicateChance = 0.0;
            this.lastDropRoll = 0.0;
        }
        NetworkState.prototype.set = function (lagMin, lagMax, dropChance, dropCorrelation, duplicateChance) {
            this.lagMin = lagMin;
            this.lagMax = lagMax;
            this.dropChance = dropChance;
            this.dropCorrelation = dropCorrelation;
            this.duplicateChance = duplicateChance;
        };
        NetworkState.prototype.copyFrom = function (src) {
            this.lagMin = src.lagMin;
            this.lagMax = src.lagMax;
            this.dropChance = src.dropChance;
            this.dropCorrelation = src.dropCorrelation;
            this.duplicateChance = src.duplicateChance;
        };
        NetworkState.prototype.randomLag = function () {
            return Math.floor(Math.random() * (this.lagMax - this.lagMin)) + this.lagMin;
        };
        NetworkState.prototype.shouldDrop = function () {
            var newRoll = this.lastDropRoll * this.dropCorrelation + Math.random() * (1.0 - this.dropCorrelation);
            this.lastDropRoll = newRoll;
            return newRoll <= this.dropChance;
        };
        NetworkState.prototype.shouldDuplicate = function () {
            return Math.random() <= this.duplicateChance;
        };
        return NetworkState;
    }());
    exports.NetworkState = NetworkState;
    var LagNetwork = /** @class */ (function () {
        function LagNetwork() {
            this.messages = [];
        }
        LagNetwork.prototype.send = function (timestamp, state, payload, fromNetworkID) {
            if (!state.shouldDrop()) {
                this.directSend(new TimedMessage(timestamp + state.randomLag(), new Message(payload, fromNetworkID)));
                if (state.shouldDuplicate()) {
                    this.directSend(new TimedMessage(timestamp + state.randomLag(), new Message(payload, fromNetworkID)));
                }
            }
        };
        LagNetwork.prototype.directSend = function (message) {
            this.messages.push(message);
        };
        LagNetwork.prototype.receive = function (timestamp) {
            for (var i = 0; i < this.messages.length; i++) {
                var message = this.messages[i];
                if (message.recvTS <= timestamp) {
                    this.messages.splice(i, 1);
                    return message.payload;
                }
            }
        };
        return LagNetwork;
    }());
    exports.LagNetwork = LagNetwork;
});
define("render", ["require", "exports"], function (require, exports) {
    "use strict";
    exports.__esModule = true;
    // Render all the entities in the given canvas
    function renderWorld(canvas, entities) {
        // Clear the canvas
        canvas.width = canvas.width;
        var colours = ["blue", "red"];
        for (var i in entities) {
            var entity = entities[i];
            // Compute size and position
            var radius = canvas.height * 0.9 / 2.0;
            var x = (entity.x / 10.0) * canvas.width;
            // Draw the entity
            var ctx = canvas.getContext("2d");
            if (ctx != undefined) {
                ctx.beginPath();
                ctx.arc(x, canvas.height / 2.0, radius, 0.0, 2.0 * Math.PI, false);
                ctx.fillStyle = colours[entity.entityID];
                ctx.fill();
                ctx.lineWidth = 5;
                ctx.strokeStyle = "dark" + colours[entity.entityID];
                ctx.stroke();
            }
        }
    }
    exports.renderWorld = renderWorld;
});
define("netlib/slidingBuffer", ["require", "exports"], function (require, exports) {
    "use strict";
    exports.__esModule = true;
    // Circular buffer
    var SlidingArrayBuffer = /** @class */ (function () {
        function SlidingArrayBuffer(maxSize, fillFunction) {
            if (maxSize === void 0) { maxSize = 32; }
            this.initialized = false;
            this.tailID = 0;
            this.headID = -1;
            this.buffer = [];
            this.maxSize = maxSize;
            this.fillFunction = fillFunction;
            for (var idx = 0; idx < this.maxSize; ++idx) {
                this.buffer.push(fillFunction(idx));
            }
        }
        SlidingArrayBuffer.prototype.getHeadID = function () {
            return this.headID;
        };
        SlidingArrayBuffer.prototype.getMaxSize = function () {
            return this.maxSize;
        };
        SlidingArrayBuffer.prototype.set = function (id, value) {
            if (id > this.headID) {
                // Reset the values that just went from tail to head
                for (var seq = this.headID + 1; seq <= id; ++seq) {
                    var idx_1 = seq % this.maxSize;
                    this.buffer[idx_1] = this.fillFunction(seq);
                }
                // Update the most recently sent ID
                this.headID = id;
            }
            var idx = id % this.maxSize;
            this.buffer[idx] = value;
            this.tailID = Math.min(this.tailID, id);
            this.tailID = Math.max(this.tailID, this.headID - this.maxSize + 1);
            this.initialized = true;
        };
        SlidingArrayBuffer.prototype.isNew = function (id) {
            return id > this.headID;
        };
        SlidingArrayBuffer.prototype.canSet = function (id) {
            if (!this.initialized) {
                return true;
            }
            return this.headID - id < this.maxSize;
        };
        SlidingArrayBuffer.prototype.canGet = function (id) {
            if (!this.initialized) {
                return false;
            }
            if (id < this.tailID) {
                return false;
            }
            return id <= this.headID;
        };
        SlidingArrayBuffer.prototype.get = function (id) {
            var idx = id % this.maxSize;
            return this.buffer[idx];
        };
        SlidingArrayBuffer.prototype.cloneBuffer = function () {
            return this.buffer.slice(0);
        };
        return SlidingArrayBuffer;
    }());
    exports.SlidingArrayBuffer = SlidingArrayBuffer;
});
define("netlib/peer", ["require", "exports", "netlib/slidingBuffer"], function (require, exports, slidingBuffer_1) {
    "use strict";
    exports.__esModule = true;
    var StoredNetReliableMessage = /** @class */ (function () {
        function StoredNetReliableMessage(msg) {
            this.resent = false;
            this.msg = msg;
            this.timeSent = +new Date();
        }
        return StoredNetReliableMessage;
    }());
    exports.StoredNetReliableMessage = StoredNetReliableMessage;
    var NetPeer = /** @class */ (function () {
        function NetPeer() {
            // To allow other peers to detect duplicates
            this.msgSeqID = 0;
            // The received seqIDs from this peer, to detect duplicates
            this.recvSeqIDs = new slidingBuffer_1.SlidingArrayBuffer(1024, function (idx) { return false; });
            // Sequence number for reliability algorithm
            this.relSeqID = 0;
            // The reliable messages sent to this peer
            this.relSentMsgs = new slidingBuffer_1.SlidingArrayBuffer(1024, function (idx) { return undefined; });
            // The reliable messages received from this peer
            this.relRecvMsgs = new slidingBuffer_1.SlidingArrayBuffer(256, function (idx) { return false; });
            // Packets are re-ordered here
            this.relRecvOrderMsgs = new slidingBuffer_1.SlidingArrayBuffer(2048, function (idx) { return undefined; });
            this.relRecvOrderStartSeqID = 0;
            this.relOrderSeqID = 0;
            // Flag indicates if this peer was sent a reliable message this frame
            this.relSent = false;
            this.sendBuffer = [];
            // Automatically assing a unique ID
            this.id = NetPeer.curID++;
        }
        NetPeer.curID = 0;
        return NetPeer;
    }());
    exports.NetPeer = NetPeer;
});
define("netlib/host", ["require", "exports", "netlib/peer"], function (require, exports, peer_1) {
    "use strict";
    exports.__esModule = true;
    var NetMessageType;
    (function (NetMessageType) {
        NetMessageType[NetMessageType["Unreliable"] = 0] = "Unreliable";
        NetMessageType[NetMessageType["Reliable"] = 1] = "Reliable";
        NetMessageType[NetMessageType["ReliableOrdered"] = 2] = "ReliableOrdered";
        NetMessageType[NetMessageType["ReliableHeartbeat"] = 3] = "ReliableHeartbeat";
    })(NetMessageType = exports.NetMessageType || (exports.NetMessageType = {}));
    var NetMessage = /** @class */ (function () {
        function NetMessage(type, payload) {
            this.type = type;
            this.payload = payload;
        }
        return NetMessage;
    }());
    exports.NetMessage = NetMessage;
    var NetReliableMessage = /** @class */ (function (_super) {
        __extends(NetReliableMessage, _super);
        function NetReliableMessage(original, relSeqID) {
            var _this = _super.call(this, original.type, original.payload) || this;
            _this.seqID = original.seqID;
            _this.relSeqID = relSeqID;
            return _this;
        }
        return NetReliableMessage;
    }(NetMessage));
    exports.NetReliableMessage = NetReliableMessage;
    var NetIncomingMessage = /** @class */ (function (_super) {
        __extends(NetIncomingMessage, _super);
        function NetIncomingMessage(original, fromPeerID) {
            var _this = _super.call(this, original.type, original.payload) || this;
            _this.seqID = original.seqID;
            _this.fromPeerID = fromPeerID;
            return _this;
        }
        return NetIncomingMessage;
    }(NetMessage));
    exports.NetIncomingMessage = NetIncomingMessage;
    var NetHost = /** @class */ (function () {
        function NetHost() {
            this.debug = false;
            // Mapping peers by their networkID
            this.peers = {};
            this.recvBuffer = [];
        }
        NetHost.prototype.acceptNewPeer = function (networkID) {
            var newPeer = new peer_1.NetPeer();
            this.peers[networkID] = newPeer;
            return newPeer;
        };
        NetHost.prototype.enqueueSend = function (msg, toNetworkID) {
            var peer = this.peers[toNetworkID];
            msg.seqID = peer.msgSeqID++;
            if (msg.type == NetMessageType.Unreliable) {
                // No extra processing required
                peer.sendBuffer.push(msg);
            }
            else {
                // Create a reliable message
                var reliableMsg = new NetReliableMessage(msg, peer.relSeqID++);
                if (reliableMsg.type == NetMessageType.ReliableOrdered) {
                    reliableMsg.relOrderSeqID = peer.relOrderSeqID++;
                }
                // Attach our acks
                reliableMsg.relRecvHeadID = peer.relRecvMsgs.getHeadID();
                reliableMsg.relRecvBuffer = peer.relRecvMsgs.cloneBuffer();
                // Store message
                peer.relSentMsgs.set(reliableMsg.relSeqID, new peer_1.StoredNetReliableMessage(reliableMsg));
                // Enqueue
                peer.sendBuffer.push(reliableMsg);
                peer.relSent = true;
            }
        };
        NetHost.prototype.enqueueRecv = function (msg, fromNetworkID) {
            var peer = this.peers[fromNetworkID];
            var incomingMsg = new NetIncomingMessage(msg, peer.id);
            // Detect and discard duplicates
            if (peer.recvSeqIDs.isNew(incomingMsg.seqID)) {
                peer.recvSeqIDs.set(incomingMsg.seqID, true); // Mark as received, and continue
            }
            else {
                if (!peer.recvSeqIDs.canGet(incomingMsg.seqID)) {
                    throw "received very old message";
                    // return; // Assume that it's a duplicate message
                }
                else if (peer.recvSeqIDs.get(incomingMsg.seqID) == true) {
                    return; // This is a duplicate message, discard it
                }
                else {
                    if (peer.recvSeqIDs.canSet(incomingMsg.seqID)) {
                        peer.recvSeqIDs.set(incomingMsg.seqID, true); // Mark as received, and continue
                    }
                    else {
                        throw "can't update duplicates";
                    }
                }
            }
            if (incomingMsg.type == NetMessageType.Unreliable) {
                // No extra processing required
                this.recvBuffer.push(incomingMsg);
            }
            else {
                var reliableMsg = msg;
                if (reliableMsg.type == NetMessageType.Reliable) {
                    // Let it be received right away
                    this.recvBuffer.push(incomingMsg);
                }
                else if (reliableMsg.type == NetMessageType.ReliableOrdered) {
                    // Store in queue
                    if (peer.relRecvOrderMsgs.canSet(reliableMsg.relOrderSeqID)) {
                        peer.relRecvOrderMsgs.set(reliableMsg.relOrderSeqID, incomingMsg);
                    }
                    else {
                        throw "received very old reliable ordered message";
                    }
                    for (var seq = peer.relRecvOrderStartSeqID; seq <= peer.relRecvOrderMsgs.getHeadID(); ++seq) {
                        if (!peer.relRecvOrderMsgs.canGet(seq)) {
                            break;
                        }
                        var msg_1 = peer.relRecvOrderMsgs.get(seq);
                        if (msg_1 == undefined) {
                            break;
                        }
                        this.recvBuffer.push(msg_1);
                        peer.relRecvOrderStartSeqID++;
                    }
                }
                else {
                    // Process heartbeat messages but don't store them
                }
                // Update our acks
                if (peer.relRecvMsgs.canSet(reliableMsg.relSeqID)) {
                    peer.relRecvMsgs.set(reliableMsg.relSeqID, true);
                }
                else {
                    // Message is too old, just ignore
                    // throw "can't update acks";
                }
                // Process the peer's acks
                var start = reliableMsg.relRecvHeadID - reliableMsg.relRecvBuffer.length + 1;
                var end = reliableMsg.relRecvHeadID;
                for (var relSeqID = start; relSeqID <= end; ++relSeqID) {
                    var idx = relSeqID % reliableMsg.relRecvBuffer.length;
                    if (reliableMsg.relRecvBuffer[idx] == true) {
                        // TODO: set ping
                    }
                    else {
                        if (peer.relSentMsgs.canGet(relSeqID)) {
                            var toResend = peer.relSentMsgs.get(relSeqID);
                            if (toResend == undefined) {
                                // Ignore
                                throw "can't find requested message to resend";
                            }
                            else {
                                // Attach our acks
                                toResend.msg.relRecvHeadID = peer.relRecvMsgs.getHeadID();
                                toResend.msg.relRecvBuffer = peer.relRecvMsgs.cloneBuffer();
                                // Enqueue
                                peer.sendBuffer.push(toResend.msg);
                                peer.relSent = true;
                            }
                        }
                        else if (relSeqID >= 0) {
                            throw "can't find requested message to resend";
                        }
                    }
                }
            }
        };
        NetHost.prototype.getSendBuffer = function (destNetworkID) {
            var peer = this.peers[destNetworkID];
            // If this peer wasn't sent any reliable messages this frame, send one for acks and ping
            if (!peer.relSent) {
                this.enqueueSend(new NetMessage(NetMessageType.ReliableHeartbeat, undefined), destNetworkID);
            }
            peer.relSent = false;
            // Returns a copy of the buffer, and empties the original buffer
            return peer.sendBuffer.splice(0);
        };
        NetHost.prototype.getRecvBuffer = function () {
            // Returns a copy of the buffer, and empties the original buffer
            return this.recvBuffer.splice(0);
        };
        return NetHost;
    }());
    exports.NetHost = NetHost;
});
define("host", ["require", "exports", "lagNetwork", "netlib/host"], function (require, exports, lagNetwork_1, host_1) {
    "use strict";
    exports.__esModule = true;
    var Host = /** @class */ (function () {
        function Host() {
            // Simulated network connection
            this.netHost = new host_1.NetHost();
            this.network = new lagNetwork_1.LagNetwork();
        }
        Host.prototype.initialize = function (canvas, status) {
            this.canvas = canvas;
            this.status = status;
            // Automatically assing a unique ID
            this.networkID = Host.curID++;
        };
        Host.prototype.setUpdateRate = function (hz) {
            this.updateRate = hz;
            clearInterval(this.updateInterval);
            this.updateInterval = setInterval((function (self) { return function () { self.update(); }; })(this), 1000 / this.updateRate);
        };
        Host.prototype.update = function () {
        };
        Host.prototype.pollMessages = function (timestamp) {
            var _this = this;
            // Get messages from LagNetwork layer
            var messages = [];
            while (true) {
                var message = this.network.receive(timestamp);
                if (!message) {
                    break;
                }
                messages.push(message);
            }
            // Pass them to our NetHost layer for processing
            // NetHost can discard a message or put one on hold until
            // an earlier one arrives.
            messages.forEach(function (message) {
                _this.netHost.enqueueRecv(message.payload, message.fromNetworkID);
            });
            return this.netHost.getRecvBuffer();
        };
        Host.curID = 0;
        return Host;
    }());
    exports.Host = Host;
});
define("server", ["require", "exports", "entity", "render", "host", "netlib/host"], function (require, exports, entity_1, render_1, host_2, host_3) {
    "use strict";
    exports.__esModule = true;
    var Server = /** @class */ (function (_super) {
        __extends(Server, _super);
        function Server(canvas, status) {
            var _this = _super.call(this) || this;
            // Connected clients and their entities
            _this.clients = [];
            _this.entities = {};
            _this.initialize(canvas, status);
            // Default update rate
            _this.setUpdateRate(10);
            return _this;
        }
        Server.prototype.connect = function (client) {
            // Connect netlibs
            client.netHost.acceptNewPeer(this.networkID);
            this.netHost.acceptNewPeer(client.networkID);
            // Give the Client enough data to identify itself
            client.server = this;
            client.localEntityID = this.clients.length;
            this.clients.push(client);
            // Create a new Entity for this Client
            var entity = new entity_1.ServerEntity();
            this.entities[client.localEntityID] = entity;
            entity.entityID = client.localEntityID;
            // Set the initial state of the Entity (e.g. spawn point)
            var spawnPoints = [4, 6];
            entity.x = spawnPoints[client.localEntityID];
        };
        Server.prototype.update = function () {
            this.processInputs();
            this.sendWorldState();
            render_1.renderWorld(this.canvas, this.entities);
        };
        // Send the world state to all the connected clients
        Server.prototype.sendWorldState = function () {
            var _this = this;
            // Gather the state of the world. In a real app, state could be filtered to avoid leaking data
            // (e.g. position of invisible enemies).
            var worldState = [];
            var numClients = this.clients.length;
            for (var i = 0; i < numClients; i++) {
                var entity = this.entities[i];
                worldState.push(entity.constructState());
            }
            var _loop_1 = function (i) {
                var client = this_1.clients[i];
                this_1.netHost.enqueueSend(new host_3.NetMessage(host_3.NetMessageType.Unreliable, worldState), client.networkID);
                this_1.netHost.getSendBuffer(client.networkID).forEach(function (message) {
                    client.network.send(+new Date(), client.recvState, message, _this.networkID);
                });
            };
            var this_1 = this;
            // Broadcast the state to all the clients
            for (var i = 0; i < numClients; i++) {
                _loop_1(i);
            }
        };
        Server.prototype.processInputs = function () {
            var _this = this;
            // Process all pending messages from clients
            var messages = this.pollMessages(+new Date());
            messages.forEach(function (message) {
                var input = message.payload;
                _this.entities[input.entityID].processInput(input);
            });
            // Show some info
            var info = "Last acknowledged input: ";
            for (var i = 0; i < this.clients.length; ++i) {
                var entity = this.entities[this.clients[i].localEntityID];
                info += "Player " + i + ": #" + (entity.getLastProcessedInput() || 0) + "   ";
            }
            this.status.textContent = info;
        };
        return Server;
    }(host_2.Host));
    exports.Server = Server;
});
define("client", ["require", "exports", "entity", "lagNetwork", "render", "host", "netlib/host"], function (require, exports, entity_2, lagNetwork_2, render_2, host_4, host_5) {
    "use strict";
    exports.__esModule = true;
    var Client = /** @class */ (function (_super) {
        __extends(Client, _super);
        function Client(canvas, status) {
            var _this = _super.call(this) || this;
            // Local representation of the entities
            _this.entities = {};
            _this.remoteEntities = {};
            // Input state
            _this.keyLeft = false;
            _this.keyRight = false;
            _this.lastServerMsgSeqID = -1;
            _this.sendState = new lagNetwork_2.NetworkState();
            _this.recvState = new lagNetwork_2.NetworkState();
            // Toggle options
            _this.clientSidePrediction = false;
            _this.serverReconciliation = false;
            _this.entityInterpolation = true;
            _this.initialize(canvas, status);
            // Update rate
            _this.setUpdateRate(50);
            return _this;
        }
        // Update Client state
        Client.prototype.update = function () {
            var _this = this;
            // Listen to the server
            this.processServerMessages();
            if (this.localEntity == undefined) {
                return; // Not connected yet
            }
            // Process inputs
            this.processInputs();
            // Send messages
            this.netHost.getSendBuffer(this.server.networkID).forEach(function (message) {
                _this.server.network.send(+new Date(), _this.sendState, message, _this.networkID);
            });
            // Interpolate other entities
            if (this.entityInterpolation) {
                this.interpolateEntities();
            }
            // Render the World
            render_2.renderWorld(this.canvas, this.entities);
            // Show some info
            var info = "Non-acknowledged inputs: " + this.localEntity.numberOfPendingInputs();
            this.status.textContent = info;
        };
        // Get inputs and send them to the server
        // If enabled, do client-side prediction
        Client.prototype.processInputs = function () {
            // Compute delta time since last update
            var nowTS = +new Date();
            var lastTS = this.lastTS || nowTS;
            var dtSec = (nowTS - lastTS) / 1000.0;
            this.lastTS = nowTS;
            // Package player's input
            var input = new entity_2.Input();
            if (this.keyRight) {
                input.pressTime = dtSec;
            }
            else if (this.keyLeft) {
                input.pressTime = -dtSec;
            }
            else {
                // Nothing interesting happened
                return;
            }
            // Send the input to the server
            input.inputSequenceNumber = this.localEntity.incrementSequenceNumber();
            input.entityID = this.localEntityID;
            this.netHost.enqueueSend(new host_5.NetMessage(host_5.NetMessageType.ReliableOrdered, input), this.server.networkID);
            // Do client-side prediction
            if (this.clientSidePrediction && this.localEntity != undefined) {
                this.localEntity.applyInput(input);
            }
            // Save this input for later reconciliation
            this.localEntity.saveInput(input);
        };
        // Process all messages from the server, i.e. world updates
        // If enabled, do server reconciliation
        Client.prototype.processServerMessages = function () {
            var _this = this;
            // Receive messages
            var messages = this.pollMessages(+new Date());
            messages.forEach(function (message) {
                if (message.seqID <= _this.lastServerMsgSeqID) {
                    // Ignore this message, it's a late one
                }
                else {
                    _this.lastServerMsgSeqID = message.seqID;
                    var payload = message.payload;
                    // World state is a list of entity states
                    for (var i = 0; i < payload.length; i++) {
                        var state = payload[i];
                        // If this is the first time we see this entity, create a local representation
                        if (_this.entities[state.entityID] == undefined) {
                            var entity = void 0;
                            if (state.entityID == _this.localEntityID) {
                                entity = _this.createLocalEntity();
                            }
                            else {
                                entity = _this.createRemoteEntity(state);
                            }
                            entity.entityID = state.entityID;
                            _this.entities[state.entityID] = entity;
                        }
                        if (state.entityID == _this.localEntityID) {
                            _this.processLocalEntityState(_this.localEntity, state);
                        }
                        else {
                            _this.processRemoteEntityState(_this.remoteEntities[state.entityID], state);
                        }
                    }
                }
            });
        };
        Client.prototype.createLocalEntity = function () {
            this.localEntity = new entity_2.LocalEntity();
            return this.localEntity;
        };
        Client.prototype.createRemoteEntity = function (state) {
            var entity = new entity_2.RemoteEntity();
            this.remoteEntities[state.entityID] = entity;
            return entity;
        };
        Client.prototype.processLocalEntityState = function (entity, state) {
            if (this.serverReconciliation) {
                entity.reconcile(state);
            }
            else {
                // Reconciliation is disabled, so drop all the saved inputs.
                entity.dropInputs();
                entity.x = state.position;
            }
        };
        Client.prototype.processRemoteEntityState = function (entity, state) {
            if (!this.entityInterpolation) {
                // Entity interpolation is disabled - just accept the server's position.
                entity.x = state.position;
            }
            else {
                // Add it to the position buffer.
                var timestamp = +new Date();
                entity.addPosition(new entity_2.InterpolationPosition(timestamp, state.position));
            }
        };
        Client.prototype.interpolateEntities = function () {
            // Compute render timestamp
            var now = +new Date();
            var renderTimestamp = now - (1000.0 / this.server.updateRate);
            for (var i in this.remoteEntities) {
                var entity = this.remoteEntities[i];
                entity.interpolate(renderTimestamp);
            }
        };
        return Client;
    }(host_4.Host));
    exports.Client = Client;
});
define("netlibTest", ["require", "exports", "host", "lagNetwork", "netlib/host"], function (require, exports, host_6, lagNetwork_3, host_7) {
    "use strict";
    exports.__esModule = true;
    var FrameRateLimiter = /** @class */ (function () {
        function FrameRateLimiter(frameRate) {
            this.lastTimestampSet = false;
            this.accumulator = 0.0;
            this.shouldStep = false;
            this.frameRate = frameRate;
        }
        FrameRateLimiter.prototype.getLastTimestamp = function () {
            return this.lastTimestamp;
        };
        FrameRateLimiter.prototype.getLastTimestampAsMilliseconds = function () {
            return Math.round(this.lastTimestamp * 1000.0);
        };
        FrameRateLimiter.prototype.getShouldStep = function () {
            return this.shouldStep;
        };
        FrameRateLimiter.prototype.update = function (timestamp) {
            if (!this.lastTimestampSet) {
                this.lastTimestamp = timestamp;
                this.lastTimestampSet = true;
            }
            var delta = timestamp - this.lastTimestamp;
            this.accumulator += delta;
            var frameDuration = 1.0 / this.frameRate;
            if (this.accumulator >= frameDuration) {
                this.shouldStep = true;
                this.accumulator -= frameDuration;
            }
            else {
                this.shouldStep = false;
            }
            this.lastTimestamp = timestamp;
        };
        return FrameRateLimiter;
    }());
    var TestServer = /** @class */ (function (_super) {
        __extends(TestServer, _super);
        function TestServer(fps) {
            var _this = _super.call(this) || this;
            // Connected clients and their entities
            _this.clients = [];
            _this.keepSending = true;
            _this.seqID = 0;
            _this.seqIDs = [];
            _this.fps = new FrameRateLimiter(fps);
            // Automatically assing a unique ID
            _this.networkID = host_6.Host.curID++;
            return _this;
        }
        TestServer.prototype.connect = function (client) {
            // Connect netlibs
            client.netHost.acceptNewPeer(this.networkID);
            this.netHost.acceptNewPeer(client.networkID);
            // Give the Client enough data to identify itself
            client.server = this;
            this.clients.push(client);
        };
        TestServer.prototype.update = function () {
            var _this = this;
            this.pollMessages(this.fps.getLastTimestampAsMilliseconds());
            var _loop_2 = function (i) {
                var client = this_2.clients[i];
                if (this_2.keepSending) {
                    var seqID = this_2.seqID++;
                    this_2.seqIDs.push(seqID);
                    this_2.netHost.enqueueSend(new host_7.NetMessage(this_2.msgType, seqID), client.networkID);
                }
                this_2.netHost.getSendBuffer(client.networkID).forEach(function (message) {
                    client.network.send(_this.fps.getLastTimestampAsMilliseconds(), client.recvState, message, _this.networkID);
                });
            };
            var this_2 = this;
            for (var i = 0; i < this.clients.length; i++) {
                _loop_2(i);
            }
        };
        return TestServer;
    }(host_6.Host));
    exports.TestServer = TestServer;
    var TestClient = /** @class */ (function (_super) {
        __extends(TestClient, _super);
        function TestClient(fps) {
            var _this = _super.call(this) || this;
            _this.sendState = new lagNetwork_3.NetworkState();
            _this.recvState = new lagNetwork_3.NetworkState();
            _this.doTrace = false;
            _this.seqIDs = [];
            _this.fps = new FrameRateLimiter(fps);
            // Automatically assing a unique ID
            _this.networkID = host_6.Host.curID++;
            return _this;
        }
        TestClient.prototype.update = function () {
            var _this = this;
            // Receive messages
            var messages = this.pollMessages(this.fps.getLastTimestampAsMilliseconds());
            messages.forEach(function (message) {
                var payload = message.payload;
                _this.seqIDs.push(payload);
                if (_this.doTrace) {
                    console.log(payload);
                }
            });
            // Send messages
            this.netHost.getSendBuffer(this.server.networkID).forEach(function (message) {
                _this.server.network.send(_this.fps.getLastTimestampAsMilliseconds(), _this.sendState, message, _this.networkID);
            });
        };
        TestClient.setNetworkState = function (state, lagMin, lagMax, dropChance, dropCorrelation, duplicateChance) {
            state.lagMin = lagMin;
            state.lagMax = lagMax;
            state.dropChance = dropChance;
            state.dropCorrelation = dropCorrelation;
            state.duplicateChance = duplicateChance;
        };
        return TestClient;
    }(host_6.Host));
    exports.TestClient = TestClient;
    var TestLauncher = /** @class */ (function () {
        function TestLauncher() {
        }
        TestLauncher.launchDefaultTests = function () {
            TestLauncher.failedTests = [];
            var averageConnection = new lagNetwork_3.NetworkState();
            averageConnection.set(100, 200, 0.02, 0.75, 0.02);
            var terribleConnection = new lagNetwork_3.NetworkState();
            terribleConnection.set(100, 200, 0.5, 0.2, 0.1);
            TestLauncher.launchTest("Average connection reliable", host_7.NetMessageType.Reliable, false, 300, 60, 10, averageConnection, averageConnection);
            TestLauncher.launchTest("Average connection reliable ordered", host_7.NetMessageType.ReliableOrdered, false, 300, 60, 10, averageConnection, averageConnection);
            TestLauncher.launchTest("Average connection reliable lowfreq", host_7.NetMessageType.Reliable, false, 300, 10, 60, averageConnection, averageConnection);
            TestLauncher.launchTest("Average connection reliable ordered lowfreq", host_7.NetMessageType.ReliableOrdered, false, 300, 10, 60, averageConnection, averageConnection);
            TestLauncher.launchTest("Terrible connection reliable", host_7.NetMessageType.Reliable, false, 300, 60, 10, terribleConnection, terribleConnection);
            TestLauncher.launchTest("Terrible connection reliable ordered", host_7.NetMessageType.ReliableOrdered, false, 300, 60, 10, terribleConnection, terribleConnection);
            TestLauncher.launchTest("Terrible connection reliable lowfreq", host_7.NetMessageType.Reliable, false, 300, 10, 60, terribleConnection, terribleConnection);
            TestLauncher.launchTest("Terrible connection reliable ordered lowfreq", host_7.NetMessageType.ReliableOrdered, false, 300, 10, 60, terribleConnection, terribleConnection);
            TestLauncher.failedTests.forEach(function (name) {
                console.log("Failed test: [" + name + "]");
            });
        };
        TestLauncher.launchTest = function (title, msgType, doTrace, time, serverFPS, clientFPS, sendState, recvState) {
            // Initialize
            var testServer = new TestServer(serverFPS);
            testServer.msgType = msgType;
            var testClient = new TestClient(clientFPS);
            testClient.doTrace = doTrace;
            testServer.connect(testClient);
            // Set network states
            testClient.sendState = sendState;
            testClient.recvState = recvState;
            // Simulate
            var curTime = 0.0;
            var maxTime = time;
            var extraTime = 15.0;
            var messagesSent = 0;
            for (var curTime_1 = 0.0; curTime_1 < maxTime + extraTime; curTime_1 += 1.0 / 60.0) {
                testServer.fps.update(curTime_1);
                testClient.fps.update(curTime_1);
                if (testServer.fps.getShouldStep()) {
                    testServer.update();
                    if (testServer.keepSending) {
                        messagesSent++;
                    }
                }
                if (testClient.fps.getShouldStep()) {
                    testClient.update();
                }
                // Let in-flight packets arrive, and give
                // the reliability protocol some time to re-send
                if (curTime_1 >= maxTime) {
                    testServer.keepSending = false;
                }
            }
            var failed = testServer.seqIDs.length != messagesSent || testServer.seqIDs.length != testClient.seqIDs.length;
            if (failed) {
                TestLauncher.failedTests.push(title);
            }
            // Print results
            console.log("[" + title + "] results:");
            if (doTrace || failed) {
                console.log("Sent: " + testServer.seqIDs.length);
                console.log("Received: " + testClient.seqIDs.length);
            }
            else {
                console.log("Success!");
            }
            console.log("");
        };
        TestLauncher.failedTests = [];
        return TestLauncher;
    }());
    exports.TestLauncher = TestLauncher;
});
define("main", ["require", "exports", "client", "server", "netlibTest"], function (require, exports, client_1, server_1, netlibTest_1) {
    "use strict";
    exports.__esModule = true;
    // Setup a server, the player's client, and another player
    var server = new server_1.Server(element("server_canvas"), element("server_status"));
    var player1 = new client_1.Client(element("player1_canvas"), element("player1_status"));
    var player2 = new client_1.Client(element("player2_canvas"), element("player2_status"));
    // Connect the clients to the server
    server.connect(player1);
    server.connect(player2);
    // Read initial parameters from the UI
    updateParameters();
    // Setup UI listeners
    setOnChangeListeners();
    // Setup keyboard input
    document.body.onkeydown = keyHandler;
    document.body.onkeyup = keyHandler;
    ///////////////////////////////////////////////////////////////////////////////
    // Netlib tests
    var testsBtn = element("tests_btn");
    testsBtn.onclick = function () {
        netlibTest_1.TestLauncher.launchDefaultTests();
    };
    ///////////////////////////////////////////////////////////////////////////////
    // Helpers
    function element(id) {
        var ret = document.getElementById(id);
        if (ret == undefined) {
            alert("Element with ID " + id + " not found.");
            return new HTMLElement(); // Tricking TypeScript's strict null check
        }
        else {
            return ret;
        }
    }
    // Set onchange listeners
    function setOnChangeListeners() {
        // Players
        setPlayerOnChangeListeners("player1");
        setPlayerOnChangeListeners("player2");
        // Server
        element("server_fps").onchange = updateParameters;
    }
    function setPlayerOnChangeListeners(prefix) {
        element(prefix + "_send_lag_min").onchange = updateParameters;
        element(prefix + "_send_lag_max").onchange = updateParameters;
        element(prefix + "_send_dropped").onchange = updateParameters;
        element(prefix + "_send_correlation").onchange = updateParameters;
        element(prefix + "_send_duplicate").onchange = updateParameters;
        element(prefix + "_recv_lag_min").onchange = updateParameters;
        element(prefix + "_recv_lag_max").onchange = updateParameters;
        element(prefix + "_recv_dropped").onchange = updateParameters;
        element(prefix + "_recv_correlation").onchange = updateParameters;
        element(prefix + "_recv_duplicate").onchange = updateParameters;
        element(prefix + "_symmetric").onchange = updateParameters;
        element(prefix + "_prediction").onchange = updateParameters;
        element(prefix + "_reconciliation").onchange = updateParameters;
        element(prefix + "_interpolation").onchange = updateParameters;
    }
    // Update simulation parameters from UI
    function updateParameters() {
        updatePlayerParameters(player1, "player1");
        updatePlayerParameters(player2, "player2");
        server.setUpdateRate(updateNumberFromUI(server.updateRate, "server_fps"));
    }
    function updatePlayerParameters(client, prefix) {
        client.sendState.lagMin = updateNumberFromUI(client.sendState.lagMin, prefix + "_send_lag_min");
        client.sendState.lagMax = updateNumberFromUI(client.sendState.lagMax, prefix + "_send_lag_max");
        client.sendState.dropChance = updateNumberFromUI(client.sendState.dropChance, prefix + "_send_dropped") / 100.0;
        client.sendState.dropCorrelation = updateNumberFromUI(client.sendState.dropCorrelation, prefix + "_send_correlation") / 100.0;
        client.sendState.duplicateChance = updateNumberFromUI(client.sendState.duplicateChance, prefix + "_send_duplicate") / 100.0;
        var cbSymmetric = element(prefix + "_symmetric");
        var recvDisplay = "initial";
        if (cbSymmetric.checked) {
            client.recvState.copyFrom(client.sendState);
            recvDisplay = "none";
        }
        else {
            client.recvState.lagMin = updateNumberFromUI(client.recvState.lagMin, prefix + "_recv_lag_min");
            client.recvState.lagMax = updateNumberFromUI(client.recvState.lagMax, prefix + "_recv_lag_max");
            client.recvState.dropChance = updateNumberFromUI(client.recvState.dropChance, prefix + "_recv_dropped") / 100.0;
            client.recvState.dropCorrelation = updateNumberFromUI(client.recvState.dropCorrelation, prefix + "_recv_correlation") / 100.0;
            client.recvState.duplicateChance = updateNumberFromUI(client.recvState.duplicateChance, prefix + "_recv_duplicate") / 100.0;
        }
        element(prefix + "_recv1").style.display = recvDisplay;
        element(prefix + "_recv2").style.display = recvDisplay;
        var cbPrediction = element(prefix + "_prediction");
        var cbReconciliation = element(prefix + "_reconciliation");
        // Client Side Prediction disabled => disable Server Reconciliation
        if (client.clientSidePrediction && !cbPrediction.checked) {
            cbReconciliation.checked = false;
        }
        // Server Reconciliation enabled => enable Client Side Prediction
        if (!client.serverReconciliation && cbReconciliation.checked) {
            cbPrediction.checked = true;
        }
        client.clientSidePrediction = cbPrediction.checked;
        client.serverReconciliation = cbReconciliation.checked;
        var cbInterpolation = element(prefix + "_interpolation");
        client.entityInterpolation = cbInterpolation.checked;
    }
    function updateNumberFromUI(oldValue, elementID) {
        var input = element(elementID);
        var newValue = parseInt(input.value);
        if (isNaN(newValue)) {
            newValue = oldValue;
        }
        input.value = String(newValue);
        return newValue;
    }
    // When the player presses the arrow keys, set the corresponding flag in the client
    function keyHandler(e) {
        if (e.keyCode == 39) {
            player1.keyRight = (e.type == "keydown");
        }
        else if (e.keyCode == 37) {
            player1.keyLeft = (e.type == "keydown");
        }
        else if (e.key == "d") {
            player2.keyRight = (e.type == "keydown");
        }
        else if (e.key == "a") {
            player2.keyLeft = (e.type == "keydown");
        }
    }
});
