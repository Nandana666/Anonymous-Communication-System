const WebSocket = require("ws");

// In-memory storage
const store = {
  publicClients: new Set(),
  privateRooms: {},
  officialSessions: {}
};

module.exports = (server) => {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    console.log("✅ New WebSocket connected");

    // Add to public clients by default
    store.publicClients.add(ws);

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } 
      catch { return; }

      // Broadcast function
      function broadcast(set) {
        set.forEach(c => {
          if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(msg));
        });
      }

      // PUBLIC CHAT
      if (msg.chatType === "public") broadcast(store.publicClients);

      // PRIVATE CHAT
      if (msg.chatType === "private" && msg.room) {
        if (!store.privateRooms[msg.room]) store.privateRooms[msg.room] = new Set();
        store.privateRooms[msg.room].add(ws);
        broadcast(store.privateRooms[msg.room]);
      }

      // OFFICIAL CHAT
      if (msg.chatType === "official" && msg.replyToken) {
        if (!store.officialSessions[msg.replyToken]) store.officialSessions[msg.replyToken] = new Set();
        store.officialSessions[msg.replyToken].add(ws);
        broadcast(store.officialSessions[msg.replyToken]);
      }

      // JOIN ROOM
      if (msg.type === "join" && msg.room) {
        if (!store.privateRooms[msg.room]) store.privateRooms[msg.room] = new Set();
        store.privateRooms[msg.room].add(ws);
      }
    });

    ws.on("close", () => {
      console.log("WebSocket disconnected");
      store.publicClients.delete(ws);
      Object.values(store.privateRooms).forEach(s => s.delete(ws));
      Object.values(store.officialSessions).forEach(s => s.delete(ws));
    });
  });
};
