const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
//const bodyParser = require("body-parser");
const crypto = require("crypto");
const cors = require("cors");
const fs = require("fs");

const app = express();
app.use(cors({
    origin: "*",
    methods: ["GET","POST"],
    allowedHeaders: ["Content-Type","Authorization"]
}));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.use(express.json());

//app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
// --------------------
// JSON Data Storage
// --------------------

const DATA_FILE = path.join(__dirname, "data.json");


// Load data
function loadData(){

    if(!fs.existsSync(DATA_FILE)){
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            pendingOfficials:{},
            approvedOfficials:{}
        }, null, 2));
    }

    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

}

// Save data
function saveData(data){
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Initialize data
let data = loadData();

// --------------------
// In-memory data
// --------------------
const admins = { "admin": "admin123" };
const adminTokens = new Set(); // ✅ FIXED token storage
const officialTokens = new Map();



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

    if (!data.pendingOfficials[email])
        return res.status(400).json({ error: "No such pending request" });

    const accessKey = crypto.randomBytes(8).toString("hex");

    data.approvedOfficials[email] = {
        ...data.pendingOfficials[email],
        accessKey
    };

    delete data.pendingOfficials[email];
    saveData(data);   // ⭐ VERY IMPORTANT
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

    res.json(data.pendingOfficials);
});


// Fetch approved
app.get("/api/admin/approved", (req, res) => {

    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer "))
        return res.status(401).json({ error: "Unauthorized" });

    const token = auth.split(" ")[1];

    if (!adminTokens.has(token))
        return res.status(401).json({ error: "Invalid token" });

    res.json(data.approvedOfficials);
});


// --------------------
// Official Signup APIs
// --------------------

// Request signup
app.post("/api/official/request", (req, res) => {

    const { email, department } = req.body;

    if (!email || !department)
        return res.status(400).json({ error: "All fields required" });

    if (data.approvedOfficials[email])
        return res.status(400).json({ error: "Already approved" });

    if (data.pendingOfficials[email])
        return res.status(400).json({ error: "Already requested" });

    data.pendingOfficials[email] = { email, department };
    saveData(data);   // ⭐ VERY IMPORTANT
    res.json({ message: "Signup request submitted!" });
});


// Check approval
app.get("/api/official/status", (req, res) => {

    const { email } = req.query;

    if (!email)
        return res.status(400).json({ error: "Email required" });

    if (!data.approvedOfficials[email])
        return res.json({ approved: false });

    res.json({
        approved: true,
        accessKey: data.approvedOfficials[email].accessKey
    });
});

// ✅ PASTE THE LOGIN ROUTE RIGHT HERE
app.post("/api/official/login", (req, res) => {

    const { email, accessKey } = req.body;

    if (!email || !accessKey)
        return res.status(400).json({ error: "All fields required" });

    const official = data.approvedOfficials[email];

    if (!official)
        return res.status(401).json({ error: "Official not approved" });

    if (official.accessKey !== accessKey)
        return res.status(401).json({ error: "Invalid access key" });

    const token = crypto.randomBytes(16).toString("hex");
    officialTokens.set(token, Date.now() + 1000 * 60 * 60 * 4); // 4 hours


    res.json({
        success: true,
        token,
        department: official.department   // ⭐ ADD THIS LINE

    });
});
// --------------------
// ✅ Unified WebSocket (FIXES MAJOR BUG)
// --------------------
wss.on("connection", (ws, req) => {

    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    const dept  = url.searchParams.get("dept");

    const expiry = officialTokens.get(token);

    if(
        !adminTokens.has(token) &&
        (!expiry || expiry < Date.now())
    ){
        ws.close();
        return;
    }


// ✅ AFTER validation → join department
    if(dept && departments[dept]){
        departments[dept].add(ws);
    }


    // ================= ADMIN =================
    if (url.pathname === "/admin") {

        //const token = url.searchParams.get("token");

        if (!token || !adminTokens.has(token)) {
            ws.close();
            return;
        }

        // Send current state
        ws.send(JSON.stringify({
            type: "pendingUpdate",
            pending: data.pendingOfficials
        }));

        ws.send(JSON.stringify({
            type: "approvedUpdate",
            approved: data.approvedOfficials
        }));

        ws.on("message", msg => {

            try {

                const message = JSON.parse(msg);


                if (message.type === "approved" && data.approvedOfficials[message.email]) {

                    wss.clients.forEach(client => {

                        if (client.readyState === WebSocket.OPEN) {

                            client.send(JSON.stringify({
                                type: "approvedUpdate",
                                approved: data.approvedOfficials
                            }));

                            client.send(JSON.stringify({
                                type: "pendingUpdate",
                                pending: data.pendingOfficials
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

        let message;
        try { message = JSON.parse(raw); }
        catch { return; }

        // Citizen-to-official
        if (message.chatType === "cto") {

            const dept = message.department;

            if (!dept || !departments[dept])
                return;

            //departments[dept].add(ws);

            departments[dept].forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(message));
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
server.listen(5000, "0.0.0.0", () =>
    console.log("Server running on port 5000")
);
