// версия 2.0
const WebSocket = require("ws");
const PORT = process.env.PORT || 3000;

const server = new WebSocket.Server({ port: PORT });

console.log("Signaling server running on port", PORT);

let rooms = {}; // { roomName: [sockets] }

server.on("connection", socket => {

    socket.on("ping", () => socket.pong());

    socket.on("message", msg => {
        let data;

        try {
            if (msg instanceof Buffer) {
                msg = msg.toString();
            }
            data = JSON.parse(msg);
        } catch (e) {
            console.log("Non-JSON message, skipping");
            return;
        }

        if (data.type === "join") {
            socket.room = data.room;
            if (!rooms[socket.room]) rooms[socket.room] = [];
            rooms[socket.room].push(socket);

            console.log("User joined room:", socket.room);
            return;
        }

        if (socket.room && rooms[socket.room]) {
            rooms[socket.room].forEach(s => {
                if (s !== socket && s.readyState === WebSocket.OPEN) {
                    s.send(JSON.stringify(data));
                }
            });
        }
    });

    socket.on("close", () => {
        if (!socket.room) return;
        rooms[socket.room] = rooms[socket.room].filter(s => s !== socket);
    });
});
