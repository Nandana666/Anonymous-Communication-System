const crypto = require("crypto");

const memoryStore = {
  // --- WebSocket connections ---
  publicClients: new Set(), // all public WS clients
  privateRooms: {},         // { roomName: Set<ws> }
  citizenSessions: {},      // { replyToken: ws }
  departmentSessions: {},   // { department: { replyToken: Set<ws> } }

  // --- Official signup/login ---
  pendingOfficials: {},     // { email: { email, department } }
  officialSessions: {}      // { email: { email, department, accessKey } }
};

// ------------------ OFFICIAL SIGNUP ------------------
memoryStore.addOfficialRequest = ({ email, department }) => {
  if (!email || !department) throw new Error("Email and Department required");

  if (memoryStore.pendingOfficials[email] || memoryStore.officialSessions[email]) {
    throw new Error("Request already exists or approved");
  }

  memoryStore.pendingOfficials[email] = { email, department };
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
  return accessKey;
};

// Get approved official (used by login or popup)
memoryStore.getApprovedOfficial = (email) => {
  return memoryStore.officialSessions[email] || null;
};

// ------------------ UTILITY ------------------
// Ensure a room exists
memoryStore.ensurePrivateRoom = (room) => {
  if (!memoryStore.privateRooms[room]) memoryStore.privateRooms[room] = new Set();
  return memoryStore.privateRooms[room];
};

// Ensure a department + replyToken exists
memoryStore.ensureDepartmentSession = (department, replyToken) => {
  if (!memoryStore.departmentSessions[department])
    memoryStore.departmentSessions[department] = {};
  if (!memoryStore.departmentSessions[department][replyToken])
    memoryStore.departmentSessions[department][replyToken] = new Set();
  return memoryStore.departmentSessions[department][replyToken];
};

module.exports = memoryStore;
