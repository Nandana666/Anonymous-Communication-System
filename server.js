const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const crypto = require("crypto");
const cors = require("cors");
const fs = require("fs");
const { Resend } = require("resend");
const resend = new Resend("re_NbWXfJEW_Cq6w1gwGMoU2hC6F9jRLuGLC");
//const nodemailer = require("nodemailer");
//const { set } = require("mongoose");

const otpStore = new Map();
const verifiedOfficials = new Set();

function generateOTP(){
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function isValidOfficialEmail(email){
    const allowedDomains = [
        "rit.ac.in",
        "police.gov.in",
        "cyber.gov.in",
        "fire.gov.in",
        "health.gov.in",
        "gov.in"
    ];

    return allowedDomains.some(domain =>
        email.toLowerCase().endsWith("@" + domain)
    );
}

// const transporter = nodemailer.createTransport({
//     service: "gmail",
//     auth: {
//         user: "yourgmail@gmail.com",
//         pass: "your_app_password"
//     }
// });
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
// 🔐 Strict 2-User Secure Private Rooms
const securePrivateRooms = new Map();
const departments = {
    College: new Set(),
    Police: new Set(),
    Cyber: new Set(),
    Fire: new Set(),
    Health: new Set()
};

// 🔐 Store department public keys
const departmentPublicKeys = {};

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
    saveData(data);   
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
    const normalizedEmail = email?.toLowerCase();

    if (!email || !department)
        return res.status(400).json({ error: "All fields required" });

    if (!isValidOfficialEmail(normalizedEmail))
        return res.status(400).json({ error: "Only official domain emails allowed" });

    if (!verifiedOfficials.has(normalizedEmail))
        return res.status(403).json({ error: "Email verification required before signup" });

    if (data.approvedOfficials[normalizedEmail])
        return res.status(400).json({ error: "Already approved" });

    if (data.pendingOfficials[normalizedEmail])
        return res.status(400).json({ error: "Already requested" });

    data.pendingOfficials[normalizedEmail] = { email: normalizedEmail, department };
    saveData(data);

    res.json({ message: "Signup request submitted!" });
});

// Check approval

app.get("/api/official/status", (req, res) => {

    const { email } = req.query;
    const normalizedEmail = email?.toLowerCase();   // ✅ FIX

    if (!email)
        return res.status(400).json({ error: "Email required" });

    if (!data.approvedOfficials[normalizedEmail])
        return res.json({ approved: false });

    res.json({
        approved: true,
        accessKey: data.approvedOfficials[normalizedEmail].accessKey
    });
});

// LOGIN ROUTE
app.post("/api/official/login", (req, res) => {

    const { email, accessKey } = req.body;
    const normalizedEmail = email?.toLowerCase();

    if (!email || !accessKey)
        return res.status(400).json({ error: "All fields required" });

    if (!isValidOfficialEmail(normalizedEmail))
        return res.status(401).json({ error: "Unauthorized domain" });

    const official = data.approvedOfficials[normalizedEmail];

    if (!official)
        return res.status(401).json({ error: "Official not approved" });

    if (official.accessKey !== accessKey)
        return res.status(401).json({ error: "Invalid access key" });

    const token = crypto.randomBytes(16).toString("hex");
    officialTokens.set(token, Date.now() + 1000 * 60 * 60 * 4);

    res.json({
        success: true,
        token,
        department: official.department
    });
});
// 🔐 Provide department public key to citizens
app.get("/api/department-key", (req, res) => {

    const dept = req.query.department?.trim();
    if (!dept) return res.json({ publicKey: null });

    const keyFile = path.join(__dirname, "data", dept, "publicKey.json");

    if (fs.existsSync(keyFile)) {
        const stored = JSON.parse(fs.readFileSync(keyFile));
        return res.json({ publicKey: stored.publicKey });
    }

    return res.json({ publicKey: null });
});
// 🔐 Provide department private key to official
app.get("/api/department-private-key", (req, res) => {

    const dept = req.query.department?.trim();
    if (!dept) return res.json({ privateKey: null });

    const keyFile = path.join(__dirname, "data", dept, "privateKey.json");

    if (fs.existsSync(keyFile)) {
        const stored = JSON.parse(fs.readFileSync(keyFile));
        return res.json({ privateKey: stored.privateKey });
    }

    return res.json({ privateKey: null });
});
// Send OTP to official email
app.post("/api/official/send-otp", async (req, res) => {

    const { email } = req.body;
    const normalizedEmail = email?.toLowerCase();

    if (!email)
        return res.status(400).json({ error: "Email required" });

    if (!isValidOfficialEmail(normalizedEmail))
        return res.status(400).json({ error: "Invalid domain" });

    const otp = generateOTP();
    otpStore.set(normalizedEmail, otp);

    // ==============================
    // ✅ REAL OTP → RIT DOMAIN
    // ==============================
    if (normalizedEmail.endsWith("@rit.ac.in")) {

    console.log("RIT OTP for", normalizedEmail, ":", otp); // backup for demo

    try {
        await resend.emails.send({
            from: "onboarding@resend.dev",
            to: normalizedEmail,
            subject: "Official Verification OTP",
            html: `<strong>Your OTP is: ${otp}</strong>`
        });

        return res.json({
            message: "OTP sent to RIT email"
        });

    } catch (err) {
        console.error("RIT email failed:", err);

        return res.status(500).json({
            error: "Failed to send OTP"
        });
    }
}

    // ==============================
    // ✅ CONSOLE OTP → GOV DOMAIN
    // ==============================
    if (
        normalizedEmail.endsWith("@police.gov.in") ||
        normalizedEmail.endsWith("@cyber.gov.in") ||
        normalizedEmail.endsWith("@fire.gov.in") ||
        normalizedEmail.endsWith("@health.gov.in") ||
        normalizedEmail.endsWith("@gov.in")
    ) {

        console.log("DEMO OTP for", normalizedEmail, ":", otp);

        return res.json({
            message: "Demo OTP generated (check server console)"
        });
    }

    return res.status(400).json({
        error: "Unsupported domain"
    });
});
// Verify OTP
app.post("/api/official/verify-otp", (req, res) => {

    const { email, otp } = req.body;

    if (!email || !otp)
        return res.status(400).json({ error: "Email and OTP required" });

    const savedOtp = otpStore.get(email.toLowerCase());

    if (!savedOtp || savedOtp !== otp) {
        return res.status(400).json({ error: "Invalid OTP" });
    }

    otpStore.delete(email.toLowerCase());
    verifiedOfficials.add(email.toLowerCase());

    res.json({ success: true, message: "Email verified successfully" });
});
// --------------------
// ✅ Unified WebSocket
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

    // ================= SEND PENDING UNREAD MESSAGES =================

    const deptFolder = path.join(__dirname, "data", dept);
    const replyFile = path.join(deptFolder, "replyData.json");

    if (fs.existsSync(replyFile)) {

        let replyData = JSON.parse(fs.readFileSync(replyFile));

        const conversations = [];

Object.keys(replyData).forEach(replyToken => {

    const convo = replyData[replyToken];

    const unreadCount = convo.messages.filter(
        m => m.from === "citizen" && m.readByOfficial === false
    ).length;

    conversations.push({
        replyToken,
        lastMessageTime: convo.messages[convo.messages.length - 1]?.timestamp,
        unreadCount
    });
});

ws.send(JSON.stringify({
    type: "conversationList",
    conversations
}));

        fs.writeFileSync(replyFile, JSON.stringify(replyData, null, 2));
    }
}




    // ================= ADMIN =================
    if (url.pathname === "/admin") {

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

        return; 
    }

    // ================= CITIZEN / OFFICIAL =================
    ws.on("message", raw => {

        let message;
        try { message = JSON.parse(raw); }
        catch { return; }
        // ================= PUBLIC CHAT =================
if (message.chatType === "public") {

    wss.clients.forEach(client => {

        if (client.readyState === WebSocket.OPEN) {

            client.send(JSON.stringify({
                chatType: "public",
                sender: message.sender,
                message: message.message
            }));

        }

    });

    return;
}
        // ================= REFRESH CONVERSATIONS =================
if (message.type === "refreshConversations" && ws.isOfficial) {

    const dept = ws.department;
    const deptFolder = path.join(__dirname, "data", dept);
    const replyFile = path.join(deptFolder, "replyData.json");

    if (!fs.existsSync(replyFile)) return;

    const replyData = JSON.parse(fs.readFileSync(replyFile));

    const conversations = [];

    Object.keys(replyData).forEach(replyToken => {

        const convo = replyData[replyToken];

        const unreadCount = convo.messages.filter(
            m => m.from === "citizen" && m.readByOfficial === false
        ).length;

        conversations.push({
            replyToken,
            lastMessageTime: convo.messages[convo.messages.length - 1]?.timestamp,
            unreadCount
        });
    });

    ws.send(JSON.stringify({
        type: "conversationList",
        conversations
    }));

    return;
}
// ================= SAVE DEPARTMENT KEYS =================
if (message.type === "departmentPublicKey") {

    if (!message.department || !message.publicKey) return;

    const dept = message.department.trim();

    const deptFolder = path.join(__dirname, "data", dept);
    if (!fs.existsSync(deptFolder)) {
        fs.mkdirSync(deptFolder, { recursive: true });
    }

    const publicKeyFile = path.join(deptFolder, "publicKey.json");
    const privateKeyFile = path.join(deptFolder, "privateKey.json");

    // Save public key
    fs.writeFileSync(publicKeyFile, JSON.stringify({
        publicKey: message.publicKey,
        updatedAt: Date.now()
    }, null, 2));

    // Save private key if provided
    if (message.privateKey) {
        fs.writeFileSync(privateKeyFile, JSON.stringify({
            privateKey: message.privateKey,
            updatedAt: Date.now()
        }, null, 2));
    }

    console.log("🔐 Keys saved for", dept);

    return;
}
// ================= LOAD HISTORY =================
if (message.chatType === "loadHistory") {

    const dept = message.department?.trim();
    const replyToken = message.replyToken;
// Store replyToken for BOTH citizen and official
ws.replyToken = replyToken;


    if (!dept || !departments[dept]) return;

    const deptFolder = path.join(__dirname, "data", dept);
    const replyFile = path.join(deptFolder, "replyData.json");

    if (!fs.existsSync(replyFile)) return;

    let replyData = JSON.parse(fs.readFileSync(replyFile));

    if (!replyData[replyToken]) return;

    // ✅ FIRST mark messages as read
    // ✅ SEND HISTORY FIRST
ws.send(JSON.stringify({
    chatType: "history",
    department: dept,
    replyToken,
    citizenPublicKey: replyData[replyToken].citizenPublicKey,
    officialPublicKey: replyData[replyToken].officialPublicKey,
    messages: replyData[replyToken].messages
}));

// ✅ THEN update read flags after sending
replyData[replyToken].messages.forEach(msg => {

    if (ws.isOfficial && msg.from === "citizen") {
        msg.readByOfficial = true;
    }

    if (ws.isCitizen && msg.from === "official") {
        msg.readByCitizen = true;
    }
});

fs.writeFileSync(replyFile, JSON.stringify(replyData, null, 2));

const conversations = [];

Object.keys(replyData).forEach(tokenKey => {

    const convo = replyData[tokenKey];

    const unreadCount = convo.messages.filter(
        m => m.from === "citizen" && m.readByOfficial === false
    ).length;

    conversations.push({
        replyToken: tokenKey,
        lastMessageTime: convo.messages[convo.messages.length - 1]?.timestamp,
        unreadCount
    });
});

ws.send(JSON.stringify({
    type: "conversationList",
    conversations
}));

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
// Store replyToken on citizen socket
if (ws.isCitizen) {
    ws.replyToken = replyToken;
}

// 🔐 Store citizen public key once per conversation
if (!replyData[replyToken].citizenPublicKey) {
    replyData[replyToken].citizenPublicKey = message.citizenPublicKey;
    replyData[replyToken].citizenPrivateKey = message.citizenPrivateKey; // store private key
}

// ---------- Store Encrypted Message ----------
replyData[replyToken].messages.push({
    from: "citizen",
    ciphertext: message.ciphertext,
    iv: message.iv,
    citizenPublicKey: message.citizenPublicKey,
    fileType: message.fileType || null,   // 🔥 ADD
    isFile: message.isFile || false,      // 🔥 ADD
    timestamp: message.timestamp,
    readByOfficial: false
});


fs.writeFileSync(replyFile, JSON.stringify(replyData, null, 2));

// ---------- Blockchain ----------
const previousBlock = chain[chain.length - 1];
const previousHash = previousBlock ? previousBlock.hash : "0";

const dataHash = crypto
    .createHash("sha256")
    .update(message.timestamp + message.ciphertext + replyToken + dept)
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
departments[dept].forEach(client => {
    if(
        client.readyState === WebSocket.OPEN &&
        client.isOfficial
    ){
        client.send(JSON.stringify({
    chatType: "cto",
    department: dept,
    ciphertext: message.ciphertext,
    iv: message.iv,
    citizenPublicKey: message.citizenPublicKey,
    fileType: message.fileType || null,   // 🔥 ADD
    isFile: message.isFile || false,      // 🔥 ADD
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

    if (!replyData[replyToken] || replyData[replyToken].department !== dept) {
        console.log("Invalid reply token for official reply");
        return;
    }
    // 🔐 Save official public key once per conversation
if (!replyData[replyToken].officialPublicKey && message.officialPublicKey) {
    replyData[replyToken].officialPublicKey = message.officialPublicKey;
}
    // ✅ Store ciphertext AS RECEIVED (TRUE E2EE)
    replyData[replyToken].messages.push({
    from: "official",
    ciphertext: message.ciphertext,
    iv: message.iv,
    officialPublicKey: message.officialPublicKey,
    fileType: message.fileType || null,   // 🔥 ADD
    isFile: message.isFile || false,      // 🔥 ADD
    timestamp: message.timestamp,
    readByCitizen: false
});

    fs.writeFileSync(replyFile, JSON.stringify(replyData, null, 2));

    // Blockchain (unchanged logic, but use message.ciphertext)
    const previousBlock = chain[chain.length - 1];
    const previousHash = previousBlock ? previousBlock.hash : "0";

    const dataHash = crypto
        .createHash("sha256")
        .update(message.timestamp + message.ciphertext + replyToken + dept)
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

    // Relay to correct citizen + officials
    wss.clients.forEach(client => {

        if (
            client.readyState === WebSocket.OPEN &&
            (
                (client.isCitizen && client.replyToken === replyToken) ||
                (client.isOfficial && client.department === dept)
            )
        ) {
            client.send(JSON.stringify({
    chatType: "otc",
    department: dept,
    replyToken,
    ciphertext: message.ciphertext,
    iv: message.iv,
    officialPublicKey: message.officialPublicKey, // 🔐 forward it
    timestamp: message.timestamp
}));
        }
    });
}

// ====================================================
// 🔐 STRICT 2-USER SECURE PRIVATE ROOM
// ====================================================

// Join private secure room
if (message.type === "join-private") {

    const room = message.room;
    const password = message.password;

    if (!room || !password) return;

    // First user creates room
    if (!securePrivateRooms.has(room)) {

        securePrivateRooms.set(room, {
            clients: new Set(),
            password: password
        });

    }

    const roomObj = securePrivateRooms.get(room);

    // ❌ PASSWORD CHECK
    if (roomObj.password !== password) {
        ws.send(JSON.stringify({
            type: "join-failed",
            reason: "Wrong password"
        }));
        return;
    }

    // ❌ ROOM FULL CHECK
    if (roomObj.clients.size >= 2) {
        ws.send(JSON.stringify({
            type: "join-failed",
            reason: "Room full"
        }));
        return;
    }

    roomObj.clients.add(ws);
    ws.secureRoom = room;

    ws.send(JSON.stringify({
        type: "room-joined",
        count: roomObj.clients.size
    }));

    // Start handshake when 2 users joined
    if (roomObj.clients.size === 2) {
        roomObj.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: "start-handshake"
                }));
            }
        });
    }

    return;
}
// 🔐 Relay signed ECDH (KEY EXCHANGE)
if (message.type === "signed-ecdh") {

    const room = message.room;
    if (!room || !securePrivateRooms.has(room)) return;

    const roomObj = securePrivateRooms.get(room);
    const roomSet = roomObj.clients;

    roomSet.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });

    return;
}
// Relay encrypted private message
if (message.chatType === "private") {

    const room = message.room;
    if (!room || !securePrivateRooms.has(room)) return;
    const roomObj = securePrivateRooms.get(room);
const roomSet = roomObj.clients;
    if (roomSet.size !== 2) return;

    roomSet.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });

    return;
}
        
    });

    ws.on("close", () => {

    if (!ws.secureRoom) return;

    const room = ws.secureRoom;

    if (!securePrivateRooms.has(room)) return;

  const roomObj = securePrivateRooms.get(room);
const roomSet = roomObj.clients;

    roomSet.delete(ws);

    console.log("User left room:", room, "Remaining:", roomSet.size);

    if (roomSet.size === 1) {

        roomSet.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {

                client.send(JSON.stringify({
                    type: "peer-disconnected"
                }));

                // 🔥 Force close remaining socket after sending
                setTimeout(() => {
                    try { client.close(); } catch {}
                }, 100);
            }
        });

        securePrivateRooms.delete(room);
    }

    if (roomSet.size === 0) {
        securePrivateRooms.delete(room);
    }
});
});


// --------------------
// Start server
// --------------------
server.listen(5000, "0.0.0.0", () =>
    console.log("Server running on port 5000")
);
