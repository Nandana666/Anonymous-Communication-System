const crypto = require("crypto");

const memoryStore = {
  publicClients: new Set(),
  privateRooms: {},
  officialSessions: {},
  pendingOfficials: {},
  citizenSessions: {},
  validInviteCodes: []
};

// Add official signup request
memoryStore.addOfficialRequest = ({ email, department }) => {
  if (!email || !department) throw new Error("Email and Department required");
  if (memoryStore.pendingOfficials[email] || memoryStore.officialSessions[email])
    throw new Error("Request already exists or official already approved");

  memoryStore.pendingOfficials[email] = { email, department };
};

// Approve official → create accessKey
memoryStore.approveOfficial = (email) => {
  const r = memoryStore.pendingOfficials[email];
  if (!r) throw new Error("No such pending request");

  const accessKey = crypto.randomBytes(4).toString("hex");
  memoryStore.officialSessions[email] = { email: r.email, department: r.department, accessKey };
  delete memoryStore.pendingOfficials[email];
  return accessKey;
};

// Create official (used by official signup after approval)
memoryStore.createOfficial = ({ email, department, inviteCode }) => {
  const o = memoryStore.officialSessions[email];
  if (!o) throw new Error("Official not approved yet by admin");
  if (o.accessKey !== inviteCode) throw new Error("Invalid invite/access key");
  return { email, department, accessKey: o.accessKey };
};

module.exports = memoryStore;
