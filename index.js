const WebSocket = require("ws");
const PORT = process.env.PORT || 3000;

const server = new WebSocket.Server({ port: PORT });

console.log("Signaling server running on port", PORT);

let rooms = {}; // { roomName: [sockets] }

server.on("connection", socket => {
    socket.on("message", msg => {
        let data = JSON.parse(msg);

        // пользователь присоединился к комнате
        if (data.type === "join") {
            const room = data.room;
            socket.room = room;

            if (!rooms[room]) rooms[room] = [];
            rooms[room].push(socket);

            console.log("User joined room:", room);
            return;
        }

        // рассылаем сообщения всем, кроме отправителя
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
