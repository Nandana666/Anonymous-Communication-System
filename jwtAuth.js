// jwtAuth.js
const jwt = require("jsonwebtoken");
const memoryStore = require("./memoryStore");

// Secret key
exports.SECRET = "jwt-secret";

// Login function for officials/admins
exports.loginOfficial = async ({ email, accessKey }) => {
  const official = memoryStore.officialSessions[email];
  if (!official) throw new Error("Official not found");
  if (official.accessKey !== accessKey) throw new Error("Invalid access key");

  const role = email === "admin@company.com" ? "admin" : "official";

  const token = jwt.sign(
    { email, department: official.department, role },
    exports.SECRET,
    { expiresIn: "2h" }
  );

  return token;
};

// Generic JWT verification
exports.verifyJWTToken = (token) => {
  try {
    return jwt.verify(token, exports.SECRET);
  } catch {
    return null;
  }
};

// Admin JWT verification
exports.verifyAdminJWT = (token) => {
  const decoded = exports.verifyJWTToken(token);
  if (!decoded) return null;
  if (decoded.role !== "admin") return null;
  return decoded;
};

// Official JWT verification
exports.verifyOfficialJWT = (token) => {
  const decoded = exports.verifyJWTToken(token);
  if (!decoded) return null;
  if (decoded.role !== "official" && decoded.role !== "admin") return null;
  return decoded;
};
