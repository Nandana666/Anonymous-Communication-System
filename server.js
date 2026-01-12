const express = require("express");
const http = require("http");
const path = require("path");
const jwt = require("jsonwebtoken");

const memoryStore = require("./memoryStore");
const jwtAuth = require("./jwtAuth");

const app = express();

// ✅ Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- OFFICIAL REQUEST ----------
app.post("/api/official/request", (req, res) => {
  try {
    memoryStore.addOfficialRequest(req.body);
    res.json({ message: "Request sent for admin approval" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- LOGIN / SIGNUP ----------
app.post("/api/signup", (req, res) => {
  try {
    const official = memoryStore.createOfficial(req.body);
    res.json(official);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const token = await jwtAuth.loginOfficial(req.body);
    res.json({ token });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

// ---------- ADMIN ----------
const ADMIN = { username: "admin", password: "Admin@123" };

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN.username && password === ADMIN.password) {
    const token = jwt.sign({ role: "admin" }, jwtAuth.SECRET);
    res.json({ token });
  } else res.status(401).json({ error: "Invalid credentials" });
});

const verifyAdmin = (req, res, next) => {
  try {
    const d = jwt.verify(req.headers.authorization.split(" ")[1], jwtAuth.SECRET);
    if (d.role !== "admin") throw "";
    next();
  } catch {
    res.sendStatus(403);
  }
};

// Admin fetch pending requests
app.get("/api/admin/requests", verifyAdmin, (req, res) => {
  res.json(memoryStore.pendingOfficials);
});

// Admin fetch approved officials
app.get("/api/admin/approved", verifyAdmin, (req, res) => {
  res.json(memoryStore.officialSessions);
});

// Approve official → generate invite/access key
app.post("/api/admin/approve", verifyAdmin, (req, res) => {
  try {
    const inviteCode = memoryStore.approveOfficial(req.body.email);
    res.json({ inviteCode });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- SERVER ----------
const server = http.createServer(app);
require("./websocket")(server);

server.listen(5000, () => console.log("✅ Server running at http://localhost:5000"));
