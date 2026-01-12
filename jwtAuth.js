const jwt = require("jsonwebtoken");
const memoryStore = require("./memoryStore");

exports.SECRET = "jwt-secret";

exports.loginOfficial = async ({ email, accessKey }) => {
  const official = memoryStore.officialSessions[email];
  if (!official) throw new Error("Official not found");
  if (official.accessKey !== accessKey) throw new Error("Invalid access key");

  const token = jwt.sign({ email, department: official.department }, exports.SECRET, { expiresIn: "2h" });
  return token;
};

exports.verifyJWTToken = (token) => {
  try {
    return jwt.verify(token, exports.SECRET);
  } catch {
    return null;
  }
};
