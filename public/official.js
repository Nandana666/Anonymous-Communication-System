let socket = null;
let selectedReplyToken = null;

document.addEventListener("DOMContentLoaded", () => {

    const token = localStorage.getItem("JWT_TOKEN");
    const department = localStorage.getItem("DEPARTMENT");

    if (!token || !department) {
        alert("Session expired. Please login again.");
        window.location.href = "login.html";
        return;
    }

    const chatBox = document.getElementById("messages");
    const input = document.getElementById("msg");

    // 🔌 Connect to WebSocket
    socket = new WebSocket(
        "ws://" + location.host + "/official?token=" + token + "&dept=" + department
    );

    socket.onopen = () => {
        console.log("✅ Official connected to", department);
    };

    socket.onclose = () => {
        console.log("⚠️ Official socket closed");
    };

    socket.onerror = () => {
        console.log("⚠️ Official socket error");
    };

    // 📩 Receive Citizen Messages
    socket.onmessage = (event) => {

    let data;
    try {
        data = JSON.parse(event.data);
    } catch {
        return;
    }

    // ======================
    // 🔵 LOAD HISTORY
    // ======================
    if(data.chatType === "history"){

    chatBox.innerHTML = "";   // clear old preview messages

    if(!data.messages || data.messages.length === 0){
        chatBox.innerHTML = "<b>No messages found for this Reply Token.</b>";
        return;
    }

    data.messages.forEach(m => {

        const div = document.createElement("div");

        const unread =
            (m.from === "citizen" && m.readByOfficial === false)
            ? " 🔴"
            : "";

        div.innerHTML = `
            <b>${m.from === "citizen" ? "Citizen" : "You"}:</b>
            ${m.message}${unread}
            <br><small>
            (${new Date(m.timestamp).toLocaleTimeString()})
            </small>
        `;

        chatBox.appendChild(div);
    });

    chatBox.scrollTop = chatBox.scrollHeight;
    return;
}


    // ======================
    // 🔵 LIVE Citizen Message
    // ======================
    if (data.chatType === "cto") {

    const div = document.createElement("div");

    div.style.border = "1px solid #ccc";
    div.style.padding = "6px";
    div.style.marginBottom = "6px";
    div.style.cursor = "pointer";

    // 🔴 Show unread indicator
    div.innerHTML = `
        <b>Citizen:</b> ${data.message} 🔴 <br>
        <small>Reply Token: ${data.replyToken}</small>
    `;

    // When clicked → load full conversation
    div.onclick = () => {

        selectedReplyToken = data.replyToken;

        socket.send(JSON.stringify({
            chatType: "loadHistory",
            department: department,
            replyToken: selectedReplyToken
        }));
    };

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}


    // ======================
    // 🟢 Show Official Replies
    // ======================
    if(data.chatType === "otc"){

        const div = document.createElement("div");
        div.innerHTML = `<b>You:</b> ${data.message}`;
        div.style.color = "green";

        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
};


    // 📤 Send Official Reply
    window.sendMessage = function () {

        if (!selectedReplyToken) {
            alert("Select a citizen message first.");
            return;
        }

        if (!input.value.trim()) return;

        if (!socket || socket.readyState !== WebSocket.OPEN) {
            alert("Connection not ready.");
            return;
        }

        const message = input.value.trim();

        socket.send(JSON.stringify({
            chatType: "otc",   // official → citizen
            replyToken: selectedReplyToken,
            department: department,
            message: message,
            timestamp: Date.now()
        }));

        // Local display
        const div = document.createElement("div");
        div.innerHTML = `
            <b>You:</b> ${message}
        `;
        div.style.color = "green";

        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;

        input.value = "";
    };
// ==============================
// 🔵 Official Manual Load Using Reply Token
// ==============================

window.loadConversation = function(){

    const tokenInput = document.getElementById("checkReplyToken");

    if(!tokenInput || !tokenInput.value.trim())
        return alert("Enter a Reply Token!");

    if(!socket || socket.readyState !== WebSocket.OPEN)
        return alert("Not connected yet...");

    const enteredToken = tokenInput.value.trim();

    selectedReplyToken = enteredToken;

    socket.send(JSON.stringify({
        chatType: "loadHistory",
        department: department,
        replyToken: enteredToken
    }));
};


});
