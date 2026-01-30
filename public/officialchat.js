document.addEventListener("DOMContentLoaded", () => {

    // --------------------
    // Anonymous ID
    // --------------------
    let anonymousId = Math.random().toString(36).substring(2,10);
    const idEl = document.getElementById("anonID");
    if(idEl) idEl.textContent = anonymousId;

    setInterval(() => {
        anonymousId = Math.random().toString(36).substring(2,10);
        if(idEl) idEl.textContent = anonymousId;
    }, 10000);

    // --------------------
    // Reply Token (per session)
    // --------------------
    const replyToken = crypto.randomUUID(); 
    const replyEl = document.getElementById("replyToken");
    if(replyEl) replyEl.textContent = replyToken;

    window.copyReplyToken = () => {
        navigator.clipboard.writeText(replyToken);
        alert("Reply token copied!");
    };

    // --------------------
    // WebSocket
    // --------------------
    const socket = new WebSocket("ws://localhost:5000"); // or your .onion URL

    socket.onopen = () => console.log("✅ WebSocket connected for C2O chat");
    socket.onerror = (err) => console.error("❌ WebSocket error:", err);
    socket.onclose = () => console.log("⚠️ WebSocket disconnected");

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // Only handle Citizen → Official messages here
        if(data.chatType === "cto") {
            const chatBox = document.getElementById("chatBox");
            if(!chatBox) return;

            const div = document.createElement("div");
            const time = new Date(data.timestamp).toLocaleTimeString();
            div.innerHTML = `<b>[${data.sender}] [${data.department}]</b>: ${data.message} <span style="color:gray;font-size:0.8em;">(${time})</span> <br><i>Reply Token: ${data.replyToken}</i>`;
            chatBox.appendChild(div);
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    };

    // --------------------
    // Send Citizen → Official Message
    // --------------------
    window.sendC2OMessage = function() {
        const input = document.getElementById("messageInput");
        const dept = document.getElementById("department").value;

        if(!input || !input.value.trim()) return alert("Enter a message!");

        const message = input.value.trim();
        const timestamp = Date.now();

        const payload = {
            chatType: "cto",
            sender: anonymousId,
            department: dept,
            message,
            replyToken,
            timestamp
        };

        if(socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(payload));
        } else {
            alert("WebSocket not connected!");
        }

        // Display locally
        const chatBox = document.getElementById("chatBox");
        const div = document.createElement("div");
        div.innerHTML = `<b>You [${dept}]</b>: ${message} <span style="color:gray;font-size:0.8em;">(${new Date(timestamp).toLocaleTimeString()})</span> <br><i>Reply Token: ${replyToken}</i>`;
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;

        input.value = "";
    };
});
