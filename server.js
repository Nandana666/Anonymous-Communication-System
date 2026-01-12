const express = require("express");
const http = require("http");
const path = require("path");
const memoryStore = require("./memoryStore");
const jwtAuth = require("./jwtAuth");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ------------------ ROUTES ------------------

// Test route
app.get("/api/ping", (req, res) => {
  res.json({ message: "Server is running" });
});

// ------------------ OFFICIALS ------------------

// Official signup route (invite + department + email)
app.post("/api/signup", async (req, res) => {
  const { email, department, inviteCode } = req.body;
  if (!email || !department || !inviteCode) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = memoryStore.createOfficial({ email, department, inviteCode });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Official login route (email + accessKey)
app.post("/api/login", async (req, res) => {
  const { email, accessKey } = req.body;
  if (!email || !accessKey) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const token = await jwtAuth.loginOfficial({ email, accessKey });
    return res.json({ token });
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
});

// ------------------ ADMIN ------------------

// Hardcoded admin credentials
const adminUser = {
  username: "admin",
  password: "Admin@123"
};

// Admin login
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });

  if (username === adminUser.username && password === adminUser.password) {
    // Generate JWT with role 'admin'
    const token = jwt.sign({ username, role: "admin" }, jwtAuth.SECRET, { expiresIn: "2h" });
    return res.json({ token });
  } else {
    return res.status(401).json({ error: "Invalid credentials" });
  }
});

// Middleware to verify admin JWT
function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.sendStatus(403);

  const token = authHeader.split(" ")[1]; // Bearer <token>
  try {
    const decoded = jwt.verify(token, jwtAuth.SECRET);
    if (decoded.role !== "admin") return res.sendStatus(403);
    req.user = decoded;
    next();
  } catch {
    res.sendStatus(401);
  }
}

// Admin generates invite code
app.post("/api/admin/invite", verifyAdmin, (req, res) => {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  memoryStore.validInviteCodes.push(code);
  res.json({ inviteCode: code });
});

// ------------------ SERVER ------------------
const server = http.createServer(app);

// WebSocket server integration
require("./websocket")(server);

const PORT = 5000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
