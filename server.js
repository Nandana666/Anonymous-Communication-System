const express = require("express");
const http = require("http");
const path = require("path");
const jwt = require("jsonwebtoken");

const memoryStore = require("./memoryStore");
const jwtAuth = require("./jwtAuth");

const app = express();

// ✅ FIX CORS (YOUR ERROR)
app.use((req,res,next)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  if(req.method==="OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- OFFICIAL REQUEST ----------
app.post("/api/official/request",(req,res)=>{
  try {
    memoryStore.addOfficialRequest(req.body);
    res.json({message:"Request sent for admin approval"});
  } catch(e) {
    res.status(400).json({error:e.message});
  }
});

// ---------- FINAL SIGNUP ----------
app.post("/api/signup",(req,res)=>{
  try {
    res.json(memoryStore.createOfficial(req.body));
  } catch(e) {
    res.status(400).json({error:e.message});
  }
});

// ---------- LOGIN ----------
app.post("/api/login",(req,res)=>{
  try {
    res.json({token: jwtAuth.loginOfficial(req.body)});
  } catch(e) {
    res.status(401).json({error:e.message});
  }
});

// ---------- ADMIN ----------
const ADMIN = { username:"admin", password:"Admin@123" };

app.post("/api/admin/login",(req,res)=>{
  if(req.body.username===ADMIN.username && req.body.password===ADMIN.password){
    res.json({
      token: jwt.sign({role:"admin"}, jwtAuth.SECRET)
    });
  } else res.sendStatus(401);
});

const verifyAdmin = (req,res,next)=>{
  try {
    const d = jwt.verify(req.headers.authorization.split(" ")[1], jwtAuth.SECRET);
    if(d.role!=="admin") throw "";
    next();
  } catch { res.sendStatus(403); }
};

app.get("/api/admin/requests",verifyAdmin,(req,res)=>{
  res.json(memoryStore.pendingOfficials);
});

app.post("/api/admin/approve",verifyAdmin,(req,res)=>{
  try {
    res.json({inviteCode: memoryStore.approveOfficial(req.body.email)});
  } catch(e){
    res.status(400).json({error:e.message});
  }
});

// ---------- SERVER ----------
const server = http.createServer(app);
require("./websocket")(server);

server.listen(5000,()=>console.log("✅ Server running on http://localhost:5000"));
