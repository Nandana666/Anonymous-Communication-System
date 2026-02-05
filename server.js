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
    const socketPath = url.pathname;

    // ================= CITIZEN SOCKET =================
if(socketPath === "/citizen"){
    ws.isCitizen = true;
    console.log("✅ Citizen connected");
}
// ================= OFFICIAL SOCKET =================
if(socketPath === "/official"){

    if(!dept || !departments[dept]){
        console.log("Invalid department:", dept);
        ws.close();
        return;
    }

    // 🔐 VALIDATE OFFICIAL TOKEN
    const expiry = officialTokens.get(token);

    if(!token || !expiry || expiry < Date.now()){
        console.log("Invalid or expired official token");
        ws.close();
        return;
    }

    ws.isOfficial = true;
    ws.department = dept;

    departments[dept].add(ws);

    console.log("✅ Official joined:", dept);
    console.log("Officials inside:", departments[dept].size);
}



//     const expiry = officialTokens.get(token);

//     // ✅ Only validate if token exists (official/admin)
// // Citizens are allowed without token
// if(token){

//     if(
//         !adminTokens.has(token) &&
//         (!expiry || expiry < Date.now())
//     ){
//         ws.close();
//         return;
//     }

// }


// // ✅ AFTER validation → join department
// if(dept && departments[dept]){

//     // Mark this socket as official
//     ws.isOfficial = !!token;
//     ws.department = dept;

//     departments[dept].add(ws);

//     console.log("✅ Joined department:", dept);
// }



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
        // ================= LOAD HISTORY =================
if (message.chatType === "loadHistory") {

    const dept = message.department?.trim();
    const replyToken = message.replyToken;

    if (!dept || !departments[dept]) return;

    const deptFolder = path.join(__dirname, "data", dept);
    const replyFile = path.join(deptFolder, "replyData.json");

    if (!fs.existsSync(replyFile)) return;

    let replyData = JSON.parse(fs.readFileSync(replyFile));

    if (!replyData[replyToken]) return;

    // Send full history
    ws.send(JSON.stringify({
        chatType: "history",
        department: dept,
        replyToken,
        messages: replyData[replyToken].messages
    }));

    // Mark messages as read
    replyData[replyToken].messages.forEach(msg => {

        if (ws.isOfficial && msg.from === "citizen") {
            msg.readByOfficial = true;
        }

        if (ws.isCitizen && msg.from === "official") {
            msg.readByCitizen = true;
        }
    });

    fs.writeFileSync(replyFile, JSON.stringify(replyData, null, 2));

    return;
}

        // Citizen-to-official
        if (message.chatType === "cto") {

           const dept = message.department?.trim();
if (!dept || !departments[dept]) return;

// ---------- Create Department Folder ----------
const deptFolder = path.join(__dirname, "data", dept);
if(!fs.existsSync(deptFolder)){
    fs.mkdirSync(deptFolder, { recursive: true });
}

const replyFile = path.join(deptFolder, "replyData.json");
const blockchainFile = path.join(deptFolder, "blockchain.json");

// ---------- Initialize Files ----------

if(!fs.existsSync(replyFile)){
    fs.writeFileSync(replyFile, JSON.stringify({}, null, 2));
}

if(!fs.existsSync(blockchainFile)){
    fs.writeFileSync(blockchainFile, JSON.stringify([], null, 2));
}

let replyData = JSON.parse(fs.readFileSync(replyFile));
let chain = JSON.parse(fs.readFileSync(blockchainFile));

let replyToken = message.replyToken;

// ---------- Generate Reply Token ----------
// ---------- Generate Reply Token ONLY if not provided ----------
if(!replyToken){

    replyToken = crypto.randomBytes(32).toString("hex");

    replyData[replyToken] = {
        department: dept,
        createdAt: Date.now(),
        messages: []
    };

    fs.writeFileSync(replyFile, JSON.stringify(replyData, null, 2));

    // Send token only once to citizen
    ws.send(JSON.stringify({
        type: "newReplyToken",
        replyToken
    }));

}

// If replyToken exists but not stored → reject (security)
else if(!replyData[replyToken] || replyData[replyToken].department !== dept){
    console.log("Invalid or cross-department reply token attempt");
    return;
}



// ---------- Store Message ----------
replyData[replyToken].messages.push({
    from: "citizen",
    message: message.message,
    timestamp: message.timestamp,
    readByOfficial: false
});


fs.writeFileSync(replyFile, JSON.stringify(replyData, null, 2));

// ---------- Blockchain ----------
const previousBlock = chain[chain.length - 1];
const previousHash = previousBlock ? previousBlock.hash : "0";

const dataHash = crypto
    .createHash("sha256")
    .update(message.timestamp + message.message + replyToken + dept)
    .digest("hex");

const block = {
    index: chain.length,
    timestamp: Date.now(),
    dataHash,
    previousHash
};

block.hash = crypto
    .createHash("sha256")
    .update(block.index + block.timestamp + block.dataHash + block.previousHash)
    .digest("hex");

chain.push(block);

fs.writeFileSync(blockchainFile, JSON.stringify(chain, null, 2));

// ---------- Send To Officials ----------
// ---------- Send To Officials ----------
departments[dept].forEach(client => {
    if(
        client.readyState === WebSocket.OPEN &&
        client.isOfficial
    ){
        client.send(JSON.stringify({
            chatType: "cto",
            department: dept,
            message: message.message,
            timestamp: message.timestamp,
            replyToken: replyToken
        }));
    }
});




        }
// ================= OFFICIAL → CITIZEN =================
if (message.chatType === "otc") {

    const dept = message.department?.trim();
    const replyToken = message.replyToken;

    if (!dept || !departments[dept]) return;

    const deptFolder = path.join(__dirname, "data", dept);
    const replyFile = path.join(deptFolder, "replyData.json");
    const blockchainFile = path.join(deptFolder, "blockchain.json");

    if (!fs.existsSync(replyFile)) return;

    let replyData = JSON.parse(fs.readFileSync(replyFile));
    let chain = JSON.parse(fs.readFileSync(blockchainFile));

    // Validate reply token
    if (!replyData[replyToken] || replyData[replyToken].department !== dept) {
        console.log("Invalid reply token for official reply");
        return;
    }

    // Store official reply
    replyData[replyToken].messages.push({
    from: "official",
    message: message.message,
    timestamp: message.timestamp,
    readByCitizen: false
});


    fs.writeFileSync(replyFile, JSON.stringify(replyData, null, 2));

    // Add block to blockchain
    const previousBlock = chain[chain.length - 1];
    const previousHash = previousBlock ? previousBlock.hash : "0";

    const dataHash = crypto
        .createHash("sha256")
        .update(message.timestamp + message.message + replyToken + dept)
        .digest("hex");

    const block = {
        index: chain.length,
        timestamp: Date.now(),
        dataHash,
        previousHash
    };

    block.hash = crypto
        .createHash("sha256")
        .update(block.index + block.timestamp + block.dataHash + block.previousHash)
        .digest("hex");

    chain.push(block);

    fs.writeFileSync(blockchainFile, JSON.stringify(chain, null, 2));

    // Send reply to BOTH citizens and officials of that department
wss.clients.forEach(client => {
    if (
        client.readyState === WebSocket.OPEN &&
        (
            client.isCitizen ||
            (client.isOfficial && client.department === dept)
        )
    ) {
        client.send(JSON.stringify({
            chatType: "otc",
            department: dept,
            replyToken,
            message: message.message,
            timestamp: message.timestamp
        }));
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
