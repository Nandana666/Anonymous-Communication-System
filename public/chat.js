let ws;
let chatType;
let room = null;
let replyToken = null;
let anonID = "";
const AES_KEY = "my_secret_key_123"; // AES key for encrypt/decrypt

// ------------------ UTIL ------------------
function generateID() {
  return Math.random().toString(36).substring(2, 10);
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ------------------ INIT ------------------
function initChat(type) {
  chatType = type;

  anonID = generateID();
  const anonEl = document.getElementById("anonID");
  if (anonEl) anonEl.innerText = "ID: " + anonID;

  // Rotate ID every 10 seconds
  setInterval(() => {
    anonID = generateID();
    if (anonEl) anonEl.innerText = "ID: " + anonID;
  }, 10000);

  const tokenEl = document.getElementById("replyToken");
  if (type === "official") {
    replyToken = generateID();
    if (tokenEl) {
      tokenEl.style.display = "inline";
      tokenEl.innerText = "Reply Token: " + replyToken;
    }
  } else if (tokenEl) {
    tokenEl.style.display = "none";
  }

  if (type === "private") {
    const roomStatus = document.getElementById("roomStatus");
    if (roomStatus) roomStatus.innerText = "No room joined";
  }

  ws = new WebSocket("ws://localhost:5000");

  ws.onopen = () => {
    console.log("✅ WebSocket connected");
    if (chatType === "private" && room) {
      ws.send(JSON.stringify({ type: "join", room }));
    }
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (!data.message) return;

      const decrypted = CryptoJS.AES.decrypt(
        data.message,
        AES_KEY
      ).toString(CryptoJS.enc.Utf8);

      addMessage(data.sender, decrypted, data.chatType);
    } catch (err) {
      console.error("Invalid message:", e.data);
    }
  };
}

// ------------------ UI ------------------
function addMessage(sender, msg, type) {
  let boxId = "publicMessages";
  if (type === "private") boxId = "privateMessages";
  if (type === "official") boxId = "officialMessages";

  const box = document.getElementById(boxId);
  if (!box) return;

  const div = document.createElement("div");

  if (sender === anonID) {
    div.className = "msg you";
    div.innerText = `You: ${msg}`;
  } else {
    div.className = "msg other";
    div.innerText = `${sender}: ${msg}`;
  }

  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ------------------ SEND ------------------
function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();
  if (!message) return;

  const encrypted = CryptoJS.AES.encrypt(message, AES_KEY).toString();

  const payload = {
    sender: anonID,
    message: encrypted,
    chatType
  };

  if (chatType === "private") payload.room = room;
  if (chatType === "official") payload.replyToken = replyToken;

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  } else {
    console.warn("⚠ WebSocket not ready");
  }

  input.value = "";
}

// ------------------ PRIVATE CHAT ------------------

// Create random room
function createRoom() {
  if (chatType !== "private") return;

  room = generateRoomCode();

  const roomStatus = document.getElementById("roomStatus");
  if (roomStatus) roomStatus.innerText = "Room Code: " + room;

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "join", room }));
  }
}

// Join existing room
function joinRoom() {
  room = document.getElementById("roomInput").value.trim().toUpperCase();
  if (!room) return alert("Enter room code");

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "join", room }));
  }

  const roomStatus = document.getElementById("roomStatus");
  if (roomStatus) roomStatus.innerText = "Joined room: " + room;
}

// ------------------ LOGOUT ------------------
function logout() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  location.href = "index.html";
}
