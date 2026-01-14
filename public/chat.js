let ws;
let chatType;
let room = null;
let replyToken = null;
let anonID = "";
const AES_KEY = "my_secret_key_123"; // AES key for encrypt/decrypt

// ------------------ UTILS ------------------
function generateID() {
  return Math.random().toString(36).substring(2, 10);
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ------------------ INIT CHAT ------------------
function initChat(type) {
  chatType = type;
  anonID = generateID();

  // Display anonID
  const anonEl = document.getElementById("anonID");
  if (anonEl) anonEl.innerText = "ID: " + anonID;

  // Rotate anonID every 10 seconds
  setInterval(() => {
    anonID = generateID();
    if (anonEl) anonEl.innerText = "ID: " + anonID;
  }, 10000);

  // Official chat: generate reply token
  if (type === "official") {
    replyToken = generateID();
    const tokenEl = document.getElementById("replyToken");
    if (tokenEl) {
      tokenEl.style.display = "inline";
      tokenEl.innerText = "Reply Token: " + replyToken;
    }
  } else {
    const tokenEl = document.getElementById("replyToken");
    if (tokenEl) tokenEl.style.display = "none";
  }

  // Private chat: show room status
  if (type === "private") {
    const roomStatus = document.getElementById("roomStatus");
    if (roomStatus) roomStatus.innerText = "No room joined";
  }

  // Connect WebSocket
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

      const decrypted = CryptoJS.AES.decrypt(data.message, AES_KEY).toString(CryptoJS.enc.Utf8);
      displayMessage(data.sender, decrypted, data.chatType);
    } catch (err) {
      console.error("Invalid message:", e.data);
    }
  };

  ws.onclose = () => console.log("⚠ WebSocket disconnected");
}

// ------------------ DISPLAY MESSAGE ------------------
function displayMessage(sender, msg, type) {
  let boxId = "publicMessages";
  if (type === "private") boxId = "privateMessages";
  if (type === "official") boxId = "officialMessages";

  const box = document.getElementById(boxId);
  if (!box) return;

  const div = document.createElement("div");
  div.className = sender === anonID ? "msg you" : "msg other";

  div.innerHTML = `<span class="anon">${sender === anonID ? "You" : sender}:</span> ${msg}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ------------------ SEND MESSAGE ------------------
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

  if (chatType === "private" && room) payload.room = room;
  if (chatType === "official") payload.replyToken = replyToken;

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  } else {
    console.warn("⚠ WebSocket not ready");
  }

  input.value = "";
}

// ------------------ PRIVATE CHAT ------------------
function createRoom() {
  if (chatType !== "private") return;

  room = generateRoomCode();
  const roomStatus = document.getElementById("roomStatus");
  if (roomStatus) roomStatus.innerText = "Room Code: " + room;

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "join", room }));
  }
}

function joinRoom() {
  if (chatType !== "private") return;

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
