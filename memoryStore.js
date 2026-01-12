const crypto = require("crypto");

const memoryStore = {
  publicClients: new Set(),
  privateRooms: {},

  // Approved officials
  officialSessions: {},

  // Pending official signup requests
  pendingOfficials: {},

  // Invite codes → email mapping
  validInviteCodes: [],

  citizenSessions: {}
};

const generateAccessKey = () => crypto.randomBytes(4).toString("hex");

// Step 1: Official submits request
memoryStore.addOfficialRequest = ({ email, department }) => {
  if (memoryStore.pendingOfficials[email])
    throw new Error("Request already submitted");

  memoryStore.pendingOfficials[email] = { email, department };
};

// Step 2: Admin approves → invite code
memoryStore.approveOfficial = (email) => {
  const req = memoryStore.pendingOfficials[email];
  if (!req) throw new Error("Request not found");

  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  memoryStore.validInviteCodes.push({ inviteCode, email });

  delete memoryStore.pendingOfficials[email];
  return inviteCode;
};

// Step 3: Final signup
memoryStore.createOfficial = ({ email, department, inviteCode }) => {
  const valid = memoryStore.validInviteCodes.find(
    i => i.inviteCode === inviteCode && i.email === email
  );
  if (!valid) throw new Error("Invalid invite code");

  const accessKey = generateAccessKey();
  memoryStore.officialSessions[email] = { email, department, accessKey };

  memoryStore.validInviteCodes =
    memoryStore.validInviteCodes.filter(i => i.inviteCode !== inviteCode);

  return { email, department, accessKey };
};

memoryStore.getOfficial = (email) => memoryStore.officialSessions[email];

module.exports = memoryStore;
