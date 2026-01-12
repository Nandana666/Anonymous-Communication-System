const crypto = require("crypto");

const memoryStore = {
  // Anonymous clients for public chat
  publicClients: new Set(),

  // Private rooms for private chat
  privateRooms: {},

  // Registered officials: email -> { email, department, inviteCode, accessKey }
  officialSessions: {},

  // WebSocket mapping for department-based official chat
  // department -> replyToken -> Set of official WS
  departmentSessions: {},

  // Citizen WS mapping: replyToken -> WS
  citizenSessions: {},

  // Admin-generated valid invite codes
  validInviteCodes: []
};

// ----------------- Utility Functions -----------------

// Generate random access key for new official
const generateAccessKey = () => crypto.randomBytes(4).toString("hex");

// Create a new official using invite code
memoryStore.createOfficial = ({ email, department, inviteCode }) => {
  if (!memoryStore.validInviteCodes.includes(inviteCode)) {
    throw new Error("Invalid invite code");
  }
  if (memoryStore.officialSessions[email]) throw new Error("Official already exists");

  const accessKey = generateAccessKey();
  memoryStore.officialSessions[email] = { email, department, inviteCode, accessKey };

  // Remove used invite code
  memoryStore.validInviteCodes = memoryStore.validInviteCodes.filter(c => c !== inviteCode);

  return { email, department, accessKey };
};

// Get official by email
memoryStore.getOfficial = (email) => memoryStore.officialSessions[email];

// Get all officials in a department
memoryStore.getOfficialsByDepartment = (department) => {
  return Object.values(memoryStore.officialSessions).filter(o => o.department === department);
};

// Add new invite code (used by admin)
memoryStore.addInviteCode = () => {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  memoryStore.validInviteCodes.push(code);
  return code;
};

module.exports = memoryStore;
