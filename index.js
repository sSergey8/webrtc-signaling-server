// версия 3.2
const WebSocket = require("ws");
const PORT = process.env.PORT || 3000;

const server = new WebSocket.Server({ port: PORT });

console.log("Signaling server running on port", PORT);

// { roomName: [socket, socket, ...] }
let rooms = {};

// helper: sanitize room name
function normalizeRoomName(name) {
    if (!name || typeof name !== "string") return null;
    const trimmed = name.trim();
    if (trimmed.length === 0) return null;
    // basic whitelist: letters, digits, hyphen, underscore
    const safe = trimmed.replace(/[^a-zA-Z0-9-_]/g, "");
    return safe || null;
}

// send JSON safely
function safeSend(ws, obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(obj));
        } catch (e) {
            console.error("safeSend error:", e);
        }
    }
}

// broadcast to all in room (optionally exclude one socket)
function broadcastToRoom(roomName, messageObj, excludeSocket = null) {
    const arr = rooms[roomName];
    if (!arr || !Array.isArray(arr)) return;
    arr.forEach(s => {
        if (s !== excludeSocket && s.readyState === WebSocket.OPEN) {
            safeSend(s, messageObj);
        }
    });
}

// Periodic ping to clean dead sockets
const PING_INTERVAL = 30000; // 30s
setInterval(() => {
    Object.keys(rooms).forEach(roomName => {
        rooms[roomName].forEach(ws => {
            try {
                if (ws.isAlive === false) {
                    console.log("Terminating dead socket in room", roomName);
                    ws.terminate();
                    return;
                }
                ws.isAlive = false;
                ws.ping(() => {});
            } catch (e) {
                console.error("Ping error:", e);
            }
        });
    });
}, PING_INTERVAL);

server.on("connection", socket => {
    socket.isAlive = true;
    socket.on("pong", () => { socket.isAlive = true; });

    socket.on("message", raw => {
        // ignore binary (we expect text)
        if (raw instanceof Buffer) return;

        let data;
        try {
            data = JSON.parse(raw.toString());
        } catch (err) {
            console.warn("Invalid JSON from client, ignoring:", raw.toString());
            return;
        }

        if (!data || typeof data.type !== "string") {
            console.warn("Malformed message (no type):", data);
            return;
        }

        // ========== JOIN ROOM ==========
        if (data.type === "join") {
            const roomRequested = normalizeRoomName(data.room || "");
            if (!roomRequested) {
                safeSend(socket, { type: "error", message: "Invalid room" });
                return;
            }

            socket.room = roomRequested;

            if (!rooms[socket.room]) rooms[socket.room] = [];
            // prevent duplicate same-socket entries
            if (!rooms[socket.room].includes(socket)) {
                rooms[socket.room].push(socket);
            }

            const count = rooms[socket.room].length;
            console.log(`User joined room ${socket.room}, count: ${count}`);

            // IMPORTANT CHANGE: send "joined" ONLY to the socket that just joined.
            // That way the second-joined client receives count===2 and becomes initiator.
            safeSend(socket, {
                type: "joined",
                count: count
            });

            // Optionally, notify existing peers that someone joined (without making them initiator)
            // e.g. broadcast to others that a new peer is present (so UI can show status)
            broadcastToRoom(socket.room, {
                type: "peer-joined",
                count: count
            }, socket);

            return;
        }

        // ========== FORWARD SIGNALING ==========
        if (socket.room && rooms[socket.room]) {
            const allowedForward = ["offer", "answer", "candidate", "bye"];
            if (allowedForward.includes(data.type)) {
                rooms[socket.room].forEach(s => {
                    if (s !== socket && s.readyState === WebSocket.OPEN) {
                        try {
                            s.send(JSON.stringify(data));
                        } catch (e) {
                            console.error("Error forwarding message:", e);
                        }
                    }
                });
            } else {
                console.warn("Unknown/unsupported message type to forward:", data.type);
            }
        } else {
            console.warn("Received signaling message but socket is not in a room:", data.type);
        }
    });

    // ========== HANDLE DISCONNECT ==========
    socket.on("close", () => {
        if (!socket.room) return;

        const roomArr = rooms[socket.room];
        if (!roomArr) return;

        rooms[socket.room] = roomArr.filter(s => s !== socket);

        // If there are still peers left, notify them of updated count
        if (rooms[socket.room] && rooms[socket.room].length > 0) {
            broadcastToRoom(socket.room, {
                type: "joined",
                count: rooms[socket.room].length
            });
        } else {
            // no peers left — clear room
            delete rooms[socket.room];
        }

        console.log(`Socket left room ${socket.room}. New count: ${rooms[socket.room] ? rooms[socket.room].length : 0}`);
    });

    socket.on("error", (err) => {
        console.warn("Socket error:", err && err.message ? err.message : err);
    });
});
