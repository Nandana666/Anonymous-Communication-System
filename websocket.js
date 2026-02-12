const WebSocket = require("ws");
const memoryStore = require("./memoryStore");
const jwtAuth = require("./jwtAuth");

module.exports = (server) => {
    const wss = new WebSocket.Server({ server });

    wss.on("connection", (ws, req) => {
        console.log("✅ New WebSocket connected");

        // Add client to public chat
        memoryStore.publicClients.add(ws);

        ws.on("message", (raw) => {
            let msg;
            try { msg = JSON.parse(raw); } catch { return; }

            if (msg.chatType === "public") {
                // Broadcast to all public clients
                memoryStore.publicClients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(msg));
                    }
                });
            }
        });

        ws.on("close", () => {
            console.log("WebSocket disconnected");
            memoryStore.publicClients.delete(ws);
        });
    });
};
