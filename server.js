const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const bodyParser = require("body-parser");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// --------------------
// In-memory data
// --------------------
const admins = { "admin": "admin123" };
const adminTokens = new Set(); // ✅ FIXED token storage

const pendingOfficials = {};
const approvedOfficials = {};

const privateRooms = new Map();
const departments = {
    Police: new Set(),
    Cyber: new Set(),
    Fire: new Set(),
    Health: new Set()
};

// --------------------
// Admin REST APIs
// --------------------

// ✅ Admin login (fixed)
app.post("/api/admin/login", (req, res) => {

    const { username, password } = req.body;

    if (!username || !password)
        return res.status(400).json({ error: "All fields required" });

    if (!admins[username] || admins[username] !== password)
        return res.status(401).json({ error: "Invalid credentials" });

    const token = crypto.randomBytes(16).toString("hex");

    adminTokens.add(token); // ✅ store token safely

    res.json({ token });
});


// Approve official
app.post("/api/admin/approve", (req, res) => {

    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer "))
        return res.status(401).json({ error: "Unauthorized" });

    const token = auth.split(" ")[1];

    if (!adminTokens.has(token))
        return res.status(401).json({ error: "Invalid token" });

    const { email } = req.body;

    if (!pendingOfficials[email])
        return res.status(400).json({ error: "No such pending request" });

    const accessKey = crypto.randomBytes(8).toString("hex");

    approvedOfficials[email] = {
        ...pendingOfficials[email],
        accessKey
    };

    delete pendingOfficials[email];

    res.json({ accessKey });
});


// Fetch pending
app.get("/api/admin/requests", (req, res) => {

    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer "))
        return res.status(401).json({ error: "Unauthorized" });

    const token = auth.split(" ")[1];

    if (!adminTokens.has(token))
        return res.status(401).json({ error: "Invalid token" });

    res.json(pendingOfficials);
});


// Fetch approved
app.get("/api/admin/approved", (req, res) => {

    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer "))
        return res.status(401).json({ error: "Unauthorized" });

    const token = auth.split(" ")[1];

    if (!adminTokens.has(token))
        return res.status(401).json({ error: "Invalid token" });

    res.json(approvedOfficials);
});


// --------------------
// Official Signup APIs
// --------------------

// Request signup
app.post("/api/official/request", (req, res) => {

    const { email, department } = req.body;

    if (!email || !department)
        return res.status(400).json({ error: "All fields required" });

    if (approvedOfficials[email])
        return res.status(400).json({ error: "Already approved" });

    if (pendingOfficials[email])
        return res.status(400).json({ error: "Already requested" });

    pendingOfficials[email] = { email, department };

    res.json({ message: "Signup request submitted!" });
});


// Check approval
app.get("/api/official/status", (req, res) => {

    const { email } = req.query;

    if (!email)
        return res.status(400).json({ error: "Email required" });

    if (!approvedOfficials[email])
        return res.json({ approved: false });

    res.json({
        approved: true,
        accessKey: approvedOfficials[email].accessKey
    });
});


// --------------------
// ✅ Unified WebSocket (FIXES MAJOR BUG)
// --------------------
wss.on("connection", (ws, req) => {

    const url = new URL(req.url, `http://${req.headers.host}`);

    // ================= ADMIN =================
    if (url.pathname === "/admin") {

        const token = url.searchParams.get("token");

        if (!token || !adminTokens.has(token)) {
            ws.close();
            return;
        }

        // Send current state
        ws.send(JSON.stringify({
            type: "pendingUpdate",
            pending: pendingOfficials
        }));

        ws.send(JSON.stringify({
            type: "approvedUpdate",
            approved: approvedOfficials
        }));

        ws.on("message", msg => {

            try {

                const data = JSON.parse(msg);

                if (data.type === "approved" && approvedOfficials[data.email]) {

                    wss.clients.forEach(client => {

                        if (client.readyState === WebSocket.OPEN) {

                            client.send(JSON.stringify({
                                type: "approvedUpdate",
                                approved: approvedOfficials
                            }));

                            client.send(JSON.stringify({
                                type: "pendingUpdate",
                                pending: pendingOfficials
                            }));
                        }
                    });
                }

            } catch {}
        });

        return; // ⭐ prevents admin socket from entering citizen logic
    }

    // ================= CITIZEN / OFFICIAL =================
    ws.on("message", raw => {

        let data;
        try { data = JSON.parse(raw); }
        catch { return; }

        // Citizen-to-official
        if (data.chatType === "cto") {

            const dept = data.department;

            if (!dept || !departments[dept])
                return;

            departments[dept].add(ws);

            departments[dept].forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        }

        // 🔵 NOTE:
        // Your public/private chat is handled inside chat.js
        // No change required here.
    });

    ws.on("close", () => {
        Object.values(departments).forEach(set => set.delete(ws));
    });
});


// --------------------
// Start server
// --------------------
server.listen(5000, "127.0.0.1", () =>
    console.log("Server running on port 5000")
);
