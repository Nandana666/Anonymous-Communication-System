const WebSocket = require("ws");
const memoryStore = require("./memoryStore");
const jwtAuth = require("./jwtAuth");

module.exports = (server) => {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    console.log("✅ New WebSocket connected");

    // Add to public clients
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
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      const broadcast = (set) => {
        if (!set) return;
        set.forEach((c) => {
          if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(msg));
        });
      };

      // -------- PUBLIC CHAT --------
      if (msg.chatType === "public") {
        broadcast(memoryStore.publicClients);
      }

      // -------- PRIVATE CHAT --------
      if (msg.chatType === "private" && msg.room) {
        const roomSet = memoryStore.ensurePrivateRoom(msg.room);
        roomSet.add(ws);
        broadcast(roomSet);
      }

      // -------- CITIZEN → OFFICIAL --------
      if (msg.chatType === "official" && msg.department && msg.replyToken && !ws.isOfficial) {
        // Store citizen WS
        memoryStore.citizenSessions[msg.replyToken] = ws;

        // Ensure department session exists
        const depSet = memoryStore.ensureDepartmentSession(msg.department, msg.replyToken);
        broadcast(depSet);

        console.log(`Citizen message sent to ${msg.department} with token ${msg.replyToken}`);
      }

      // -------- OFFICIAL → CITIZEN --------
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

      // -------- JOIN ROOM --------
      if (msg.type === "join" && msg.room) {
        const roomSet = memoryStore.ensurePrivateRoom(msg.room);
        roomSet.add(ws);
      }

      // -------- REGISTER OFFICIAL FOR REPLY TOKEN --------
      if (msg.type === "registerOfficial" && ws.isOfficial && msg.replyToken) {
        const deptSet = memoryStore.ensureDepartmentSession(ws.user.department, msg.replyToken);
        deptSet.add(ws);
      }
    });

    // ----------------- CONNECTION CLOSE -----------------
    ws.on("close", () => {
      console.log("WebSocket disconnected");

      memoryStore.publicClients.delete(ws);

      Object.values(memoryStore.privateRooms).forEach((s) => s.delete(ws));
      Object.values(memoryStore.departmentSessions).forEach((dep) => {
        Object.values(dep).forEach((s) => s.delete(ws));
      });

      // Remove citizen sessions if exists
      for (const token in memoryStore.citizenSessions) {
        if (memoryStore.citizenSessions[token] === ws) delete memoryStore.citizenSessions[token];
      }
    });
  });
};
