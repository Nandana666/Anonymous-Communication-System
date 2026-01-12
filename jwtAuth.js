const jwt = require("jsonwebtoken");
const memoryStore = require("./memoryStore");

const SECRET = "jwt-secret";
exports.SECRET = SECRET;

// ----------------- Express Middleware -----------------

// Verify JWT for REST endpoints
exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(403).json({ error: "No authorization header" });

  const token = authHeader.split(" ")[1]; // Bearer <token>
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded; // { email, department }
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

// ----------------- Official Login -----------------

// Login official and generate JWT
exports.loginOfficial = async ({ email, accessKey }) => {
  const official = memoryStore.getOfficial(email);
  if (!official) throw new Error("Official not found");
  if (official.accessKey !== accessKey) throw new Error("Invalid access key");

  // JWT payload includes email and department
  const token = jwt.sign(
    { email, department: official.department },
    SECRET,
    { expiresIn: "2h" }
  );
  return token;
};

// ----------------- WebSocket JWT Verification -----------------

// For WebSocket connections
exports.verifyJWTToken = (token) => {
  try {
    return jwt.verify(token, SECRET); // returns decoded payload if valid
  } catch (err) {
    console.log("WebSocket JWT verification failed:", err.message);
    return null;
  }
};
