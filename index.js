// версия 3.0
const WebSocket = require("ws");
const PORT = process.env.PORT || 3000;

const server = new WebSocket.Server({ port: PORT });

console.log("Signaling server running on port", PORT);

// { roomName: [socket, socket] }
let rooms = {};

server.on("connection", socket => {

    socket.on("message", raw => {
        if (raw instanceof Buffer) return;

        let data;
        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        // ========== JOIN ROOM ==========
        if (data.type === "join") {
            socket.room = data.room;

            if (!rooms[socket.room]) rooms[socket.room] = [];
            rooms[socket.room].push(socket);

            const count = rooms[socket.room].length;

            console.log(`User joined room ${socket.room}, count: ${count}`);

            // отвечаем ТОЛЬКО этому клиенту
            // Уведомляем всех в комнате
rooms[socket.room].forEach(s => {
    if (s.readyState === WebSocket.OPEN) {
        s.send(JSON.stringify({
            type: "joined",
            count: rooms[socket.room].length
        }));
    }
});


            return;
        }

        // ========== FORWARD SIGNALING ==========
        if (socket.room && rooms[socket.room]) {
            rooms[socket.room].forEach(s => {
                if (s !== socket && s.readyState === WebSocket.OPEN) {
                    s.send(JSON.stringify(data));
                }
            });
        }
    });

    // ========== HANDLE DISCONNECT ==========
    socket.on("close", () => {
        if (!socket.room) return;

        rooms[socket.room] = rooms[socket.room].filter(s => s !== socket);

        if (rooms[socket.room].length === 0) {
            delete rooms[socket.room];
        }
    });
});
