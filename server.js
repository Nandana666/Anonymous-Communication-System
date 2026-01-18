const express = require("express");
const http = require("http");
const path = require("path");
const jwt = require("jsonwebtoken");

const memoryStore = require("./memoryStore");
const jwtAuth = require("./jwtAuth");

const app = express();

/* =======================
   🔒 IP ANONYMITY SETTING
   ======================= */
// IMPORTANT: Do NOT trust proxy headers
// This prevents Express from extracting real client IPs
app.set("trust proxy", false);

/* =======================
   GLOBAL CORS FIX
   ======================= */
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =======================
   OFFICIAL REQUEST
   ======================= */
app.post("/api/official/request", (req, res) => {
  try {
    memoryStore.addOfficialRequest(req.body);
    res.json({ message: "Request sent for admin approval" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* =======================
   OFFICIAL STATUS (POPUP)
   ======================= */
app.get("/api/official/status", (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email required" });

  const official = memoryStore.getApprovedOfficial(email);

  if (!official) return res.json({ approved: false });

  res.json({
    approved: true,
    accessKey: official.accessKey,
    department: official.department
  });
});

/* =======================
   OFFICIAL LOGIN
   ======================= */
app.post("/api/login", (req, res) => {
  try {
    const token = jwtAuth.loginOfficial(req.body);
    res.json({ token });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

/* =======================
   ADMIN SECTION
   ======================= */
const ADMIN = { username: "admin", password: "Admin@123" };

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN.username && password === ADMIN.password) {
    const token = jwt.sign({ role: "admin" }, jwtAuth.SECRET, {
      expiresIn: "2h"
    });
    res.json({ token });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

function verifyAdmin(req, res, next) {
  try {
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, jwtAuth.SECRET);
    if (decoded.role !== "admin") throw "";
    next();
  } catch {
    res.sendStatus(403);
  }
}

app.get("/api/admin/requests", verifyAdmin, (req, res) => {
  res.json(memoryStore.pendingOfficials);
});

app.get("/api/admin/approved", verifyAdmin, (req, res) => {
  res.json(memoryStore.officialSessions);
});

app.post("/api/admin/approve", verifyAdmin, (req, res) => {
  try {
    const accessKey = memoryStore.approveOfficial(req.body.email);
    res.json({ accessKey });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* =======================
   SERVER
   ======================= */
const server = http.createServer(app);
require("./websocket")(server);

server.listen(5000, () =>
  console.log("✅ Server running at http://localhost:5000")
);
