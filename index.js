// версия 2.1
const WebSocket = require("ws");
const PORT = process.env.PORT || 3000;

const server = new WebSocket.Server({ port: PORT });

console.log("Signaling server running on port", PORT);

let rooms = {};

server.on("connection", socket => {

    socket.on("message", raw => {
        // игнорируем ping/pong и другие бинарные сообщения от Render
        if (raw instanceof Buffer) return;

        let data;
        try {
            data = JSON.parse(raw.toString());
        } catch (e) {
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

        rooms[socket.room] =
            rooms[socket.room].filter(s => s !== socket);
    });
});

