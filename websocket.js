const WebSocket = require("ws");
const memoryStore = require("./memoryStore");
const jwtAuth = require("./jwtAuth");

module.exports = (server) => {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    console.log("✅ New WebSocket connected");

    /* =====================================================
       🔒 IP ANONYMITY GUARANTEE
       -----------------------------------------------------
       - Do NOT access req.socket.remoteAddress
       - Do NOT access ws._socket.remoteAddress
       - Do NOT read X-Forwarded-For headers
       - All identification is token / session based only
       ===================================================== */

    // ---------------- PARSE QUERY PARAMS ----------------
    const params = new URLSearchParams(req.url.split("?")[1]);
    const token = params.get("token");
    const adminMode = req.url.startsWith("/admin");

    // ---------------- ADMIN ----------------
    if (adminMode && token) {
      const admin = jwtAuth.verifyAdminJWT(token);
      if (!admin) {
        ws.close(1008, "Unauthorized");
        return;
      }
      ws.isAdmin = true;
      console.log("Admin connected");
      memoryStore.adminClients.add(ws);

      // Initial admin data
      ws.send(
        JSON.stringify({
          type: "pendingUpdate",
          pending: memoryStore.pendingOfficials
        })
      );
      ws.send(
        JSON.stringify({
          type: "approvedUpdate",
          approved: memoryStore.officialSessions
        })
      );
    }

    // ---------------- OFFICIAL ----------------
    if (token) {
      const user = jwtAuth.verifyJWTToken(token);
      if (user) {
        ws.user = user;
        ws.isOfficial = true;
        console.log(`Official connected: ${user.email}`);
      }
    }

    // ---------------- PUBLIC CHAT ----------------
    memoryStore.publicClients.add(ws);

    // ---------------- MESSAGE HANDLING ----------------
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
          if (c.readyState === WebSocket.OPEN) {
            c.send(JSON.stringify(msg));
          }
        });
      };

      // ---------------- PUBLIC ----------------
      if (msg.chatType === "public") {
        broadcast(memoryStore.publicClients);
      }

      // ---------------- PRIVATE ----------------
      if (msg.chatType === "private" && msg.room) {
        const roomSet = memoryStore.ensurePrivateRoom(msg.room);
        roomSet.add(ws);
        broadcast(roomSet);
      }

      // ---------------- CITIZEN → OFFICIAL ----------------
      if (
        msg.chatType === "official" &&
        msg.department &&
        msg.replyToken &&
        !ws.isOfficial
      ) {
        memoryStore.citizenSessions[msg.replyToken] = ws;
        const depSet = memoryStore.ensureDepartmentSession(
          msg.department,
          msg.replyToken
        );
        broadcast(depSet);

        console.log(
          `Citizen message sent to ${msg.department} with token ${msg.replyToken}`
        );
      }

      // ---------------- OFFICIAL → CITIZEN ----------------
      if (
        msg.chatType === "official" &&
        msg.replyToCitizenToken &&
        ws.isOfficial
      ) {
        const citizenWS =
          memoryStore.citizenSessions[msg.replyToCitizenToken];

        if (citizenWS && citizenWS.readyState === WebSocket.OPEN) {
          citizenWS.send(
            JSON.stringify({
              chatType: "official",
              text: msg.text,
              department: ws.user.department,
              replyToken: msg.replyToCitizenToken
            })
          );
        }
      }

      // ---------------- JOIN ROOM ----------------
      if (msg.type === "join" && msg.room) {
        const roomSet = memoryStore.ensurePrivateRoom(msg.room);
        roomSet.add(ws);
      }

      // ---------------- REGISTER OFFICIAL ----------------
      if (msg.type === "registerOfficial" && ws.isOfficial && msg.replyToken) {
        const deptSet = memoryStore.ensureDepartmentSession(
          ws.user.department,
          msg.replyToken
        );
        deptSet.add(ws);
      }

      // ---------------- ADMIN UPDATES ----------------
      if (ws.isAdmin && msg.type === "approved" && msg.email) {
        const pending = memoryStore.pendingOfficials;
        const approved = memoryStore.officialSessions;

        memoryStore.adminClients.forEach((adminWs) => {
          if (adminWs.readyState === WebSocket.OPEN) {
            adminWs.send(
              JSON.stringify({ type: "pendingUpdate", pending })
            );
            adminWs.send(
              JSON.stringify({ type: "approvedUpdate", approved })
            );
          }
        });
      }
    });

    // ---------------- CONNECTION CLOSE ----------------
    ws.on("close", () => {
      console.log("WebSocket disconnected");

      memoryStore.publicClients.delete(ws);
      memoryStore.adminClients.delete(ws);

      Object.values(memoryStore.privateRooms).forEach((s) => s.delete(ws));

      Object.values(memoryStore.departmentSessions).forEach((dep) => {
        Object.values(dep).forEach((s) => s.delete(ws));
      });

      for (const token in memoryStore.citizenSessions) {
        if (memoryStore.citizenSessions[token] === ws) {
          delete memoryStore.citizenSessions[token];
        }
      }
    });
  });
};
