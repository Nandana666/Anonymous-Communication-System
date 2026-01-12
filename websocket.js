const WebSocket = require("ws");
const memoryStore = require("./memoryStore");
const jwtAuth = require("./jwtAuth");

module.exports = (server) => {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    console.log("✅ New WebSocket connected");

    // Add to public clients by default
    memoryStore.publicClients.add(ws);

    // ----------------- OFFICIAL JWT CHECK -----------------
    const params = new URLSearchParams(req.url.split("?")[1]);
    const token = params.get("token");
    if (token) {
      const user = jwtAuth.verifyJWTToken(token);
      if (user) {
        ws.user = user;
        ws.isOfficial = true;
        console.log(`Official connected: ${user.email}`);
      } else {
        console.log("Invalid JWT, connecting as anonymous");
      }
    }

    // ----------------- MESSAGE HANDLING -----------------
    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      const broadcast = (set) => {
        set.forEach(c => {
          if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(msg));
        });
      };

      // ---------------- PUBLIC CHAT ----------------
      if (msg.chatType === "public") broadcast(memoryStore.publicClients);

      // ---------------- PRIVATE CHAT ----------------
      if (msg.chatType === "private" && msg.room) {
        if (!memoryStore.privateRooms[msg.room]) memoryStore.privateRooms[msg.room] = new Set();
        memoryStore.privateRooms[msg.room].add(ws);
        broadcast(memoryStore.privateRooms[msg.room]);
      }

      // ---------------- CITIZEN → OFFICIAL ----------------
      if (msg.chatType === "official" && msg.department && msg.replyToken && !ws.isOfficial) {
        // Store citizen WS by replyToken
        memoryStore.citizenSessions[msg.replyToken] = ws;

        // Initialize department sessions for this replyToken
        if (!memoryStore.departmentSessions[msg.department]) memoryStore.departmentSessions[msg.department] = {};
        if (!memoryStore.departmentSessions[msg.department][msg.replyToken])
          memoryStore.departmentSessions[msg.department][msg.replyToken] = new Set();

        // Broadcast to all officials in this department for this replyToken
        memoryStore.departmentSessions[msg.department][msg.replyToken].forEach(c => {
          if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(msg));
        });

        console.log(`Citizen message sent to ${msg.department} with token ${msg.replyToken}`);
      }

      // ---------------- OFFICIAL → CITIZEN ----------------
      if (msg.chatType === "official" && msg.replyToCitizenToken && ws.isOfficial) {
        const citizenWS = memoryStore.citizenSessions[msg.replyToCitizenToken];
        if (citizenWS && citizenWS.readyState === WebSocket.OPEN) {
          citizenWS.send(JSON.stringify({
            chatType: "official",
            text: msg.text,
            department: ws.user.department,
            replyToken: msg.replyToCitizenToken
          }));
          console.log(`Official ${ws.user.email} replied to citizen ${msg.replyToCitizenToken}`);
        }
      }

      // ---------------- JOIN ROOM ----------------
      if (msg.type === "join" && msg.room) {
        if (!memoryStore.privateRooms[msg.room]) memoryStore.privateRooms[msg.room] = new Set();
        memoryStore.privateRooms[msg.room].add(ws);
      }

      // ---------------- OFFICIAL WS REGISTRATION ----------------
      if (msg.type === "registerOfficial" && ws.isOfficial) {
        const dept = ws.user.department;
        const replyToken = msg.replyToken;
        if (!memoryStore.departmentSessions[dept]) memoryStore.departmentSessions[dept] = {};
        if (!memoryStore.departmentSessions[dept][replyToken])
          memoryStore.departmentSessions[dept][replyToken] = new Set();
        memoryStore.departmentSessions[dept][replyToken].add(ws);
      }
    });

    // ----------------- CONNECTION CLOSE -----------------
    ws.on("close", () => {
      console.log("WebSocket disconnected");
      memoryStore.publicClients.delete(ws);
      Object.values(memoryStore.privateRooms).forEach(s => s.delete(ws));
      Object.values(memoryStore.departmentSessions).forEach(dep => {
        Object.values(dep).forEach(s => s.delete(ws));
      });

      // Remove citizen sessions if exists
      for (const token in memoryStore.citizenSessions) {
        if (memoryStore.citizenSessions[token] === ws) delete memoryStore.citizenSessions[token];
      }
    });
  });
};
