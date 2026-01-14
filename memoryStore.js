const crypto = require("crypto");

const memoryStore = {
  // --- WebSocket connections ---
  publicClients: new Set(),
  adminClients: new Set(),
  privateRooms: {},              // roomName -> Set<ws>
  citizenSessions: {},           // replyToken -> ws
  departmentSessions: {},        // department -> replyToken -> Set<ws>

  // --- Official signup/login ---
  pendingOfficials: {},          // email -> { email, department }
  officialSessions: {},          // email -> { email, department, accessKey }
};

// ------------------ OFFICIAL SIGNUP ------------------
memoryStore.addOfficialRequest = ({ email, department }) => {
  if (!email || !department) throw new Error("Email and Department required");
  if (memoryStore.pendingOfficials[email] || memoryStore.officialSessions[email])
    throw new Error("Request already exists or approved");

  memoryStore.pendingOfficials[email] = { email, department };

  // Broadcast pending updates to all admin clients
  memoryStore.adminClients.forEach(adminWs => {
    if (adminWs.readyState === 1) adminWs.send(JSON.stringify({
      type: "pendingUpdate",
      pending: memoryStore.pendingOfficials
    }));
  });
};

// Approve signup → generate access key
memoryStore.approveOfficial = (email) => {
  const r = memoryStore.pendingOfficials[email];
  if (!r) throw new Error("No such request");

  const accessKey = crypto.randomBytes(4).toString("hex");
  memoryStore.officialSessions[email] = {
    email: r.email,
    department: r.department,
    accessKey
  };
  delete memoryStore.pendingOfficials[email];

  // Broadcast updates to all admin clients
  memoryStore.adminClients.forEach(adminWs => {
    if (adminWs.readyState === 1) {
      adminWs.send(JSON.stringify({ type: "pendingUpdate", pending: memoryStore.pendingOfficials }));
      adminWs.send(JSON.stringify({ type: "approvedUpdate", approved: memoryStore.officialSessions }));
    }
  });

  return accessKey;
};

// Get approved official
memoryStore.getApprovedOfficial = (email) => memoryStore.officialSessions[email] || null;

// ------------------ UTILITY ------------------
memoryStore.ensurePrivateRoom = (room) => {
  if (!memoryStore.privateRooms[room]) memoryStore.privateRooms[room] = new Set();
  return memoryStore.privateRooms[room];
};

memoryStore.ensureDepartmentSession = (department, replyToken) => {
  if (!memoryStore.departmentSessions[department])
    memoryStore.departmentSessions[department] = {};
  if (!memoryStore.departmentSessions[department][replyToken])
    memoryStore.departmentSessions[department][replyToken] = new Set();
  return memoryStore.departmentSessions[department][replyToken];
};

module.exports = memoryStore;
