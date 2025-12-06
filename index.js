// index.js — signaling server v3.3 (stable)
const WebSocket = require("ws");
const PORT = process.env.PORT || 3000;

console.log("Signaling server starting on port", PORT);

// WebSocket server (plain)
const wss = new WebSocket.Server({ port: PORT });

// rooms: { roomName: [socket, socket, ...] }
let rooms = {};

// heartbeat to detect dead sockets
function noop() {}
function heartbeat() { this.isAlive = true; }

function safeSend(ws, obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(obj));
        } catch (e) {
            console.error("safeSend error:", e);
        }
    }
}

function cleanupRoom(room) {
    if (!rooms[room]) return;
    // remove closed sockets
    rooms[room] = rooms[room].filter(s => s && s.readyState === WebSocket.OPEN);
    if (rooms[room].length === 0) delete rooms[room];
}

wss.on('connection', socket => {
    socket.isAlive = true;
    socket.on('pong', heartbeat);

    // avoid duplicate entries by giving each socket an id (optional)
    socket._id = Math.random().toString(36).slice(2, 9);

    socket.on('message', raw => {
        // ignore binary
        if (raw instanceof Buffer) return;

        let data;
        try { data = JSON.parse(raw.toString()); } catch (e) { return; }
        if (!data || !data.type) return;

        // === JOIN ===
        if (data.type === "join") {
            const room = (data.room || "default-room").toString();

            socket.room = room;

            if (!rooms[room]) rooms[room] = [];

            // prevent duplicate same-socket entries
            if (!rooms[room].includes(socket)) {
                rooms[room].push(socket);
            }

            // cleanup stale entries
            cleanupRoom(room);

            const count = rooms[room].length;
            console.log(`User joined room ${room}, count: ${count}`);

            // send joined ONLY to this socket
            safeSend(socket, { type: "joined", count });

            // notify other peers (optional notification, won't trigger offers)
            rooms[room].forEach(s => {
                if (s !== socket && s.readyState === WebSocket.OPEN) {
                    safeSend(s, { type: "peer-joined", count });
                }
            });

            return;
        }

        // === BYE (optional) ===
        if (data.type === "bye") {
            // close socket gracefully
            try { socket.close(); } catch(e) {}
            return;
        }

        // === FORWARD signaling (offer/answer/candidate) ===
        if (socket.room && rooms[socket.room]) {
            // forward to everyone EXCEPT sender
            rooms[socket.room].forEach(s => {
                if (s !== socket && s.readyState === WebSocket.OPEN) {
                    safeSend(s, data);
                }
            });
        } else {
            console.warn("Received signaling but socket has no room:", data.type);
        }
    });

    socket.on('close', () => {
        if (!socket.room) return;
        const room = socket.room;
        rooms[room] = (rooms[room] || []).filter(s => s !== socket && s.readyState === WebSocket.OPEN);

        // notify remaining peers of updated count
        const newCount = rooms[room] ? rooms[room].length : 0;
        if (rooms[room] && rooms[room].length > 0) {
            rooms[room].forEach(s => {
                safeSend(s, { type: "joined", count: newCount });
            });
        } else {
            delete rooms[room];
        }

        console.log(`Socket left room ${room}. New count: ${newCount}`);
    });

    socket.on('error', (err) => {
        console.warn("Socket error:", err && err.message ? err.message : err);
    });
});

// periodic ping to detect dead sockets
const INTERVAL = 30000;
setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            console.log("Terminating dead socket", ws._id);
            return ws.terminate();
        }
        ws.isAlive = false;
        try { ws.ping(noop); } catch (e) {}
    });

    // also cleanup empty rooms to avoid memory leak
    Object.keys(rooms).forEach(room => {
        rooms[room] = (rooms[room] || []).filter(s => s && s.readyState === WebSocket.OPEN);
        if (!rooms[room] || rooms[room].length === 0) delete rooms[room];
    });
}, INTERVAL);

console.log("Signaling server running on port", PORT);
