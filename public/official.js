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

        // Only handle citizen → official messages
        if (data.chatType !== "cto") return;

        const div = document.createElement("div");

        div.style.border = "1px solid #ccc";
        div.style.padding = "6px";
        div.style.marginBottom = "6px";
        div.style.cursor = "pointer";

        div.innerHTML = `
            <b>Citizen:</b> ${data.message} <br>
            <small>Reply Token: ${data.replyToken}</small>
        `;

        // Click to select this conversation
        div.onclick = () => {
            selectedReplyToken = data.replyToken;
            alert("Selected Reply Token:\n" + selectedReplyToken);
        };

        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
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

});
