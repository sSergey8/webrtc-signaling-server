import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;

const wss = new WebSocketServer({ port: PORT });
console.log("Signaling server started on port", PORT);

wss.on("connection", ws => {
    ws.on("message", msg => {
        // перенаправляем сообщение всем, кроме отправителя
        wss.clients.forEach(client => {
            if (client !== ws && client.readyState === 1) {
                client.send(msg);
            }
        });
    });
});
