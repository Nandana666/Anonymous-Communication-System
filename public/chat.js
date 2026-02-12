document.addEventListener("DOMContentLoaded", () => {

    // Anonymous ID
    let anonymousId = Math.random().toString(36).substring(2,10);
    const idEl = document.getElementById("anonId");
    if(idEl) idEl.textContent = anonymousId;

    setInterval(() => {
        anonymousId = Math.random().toString(36).substring(2,10);
        if(idEl) idEl.textContent = anonymousId;
    }, 10000);

    // WebSocket: use your .onion address
    const socket = new WebSocket("ws://6ilgankjprplq6j2y7b367efkcxgwjh3l5n7pt23ohkrq3mkfimg2dyd.onion/"); // replace with your .onion

    socket.onopen = () => console.log("✅ WebSocket connected");
    socket.onerror = (err) => console.error("❌ WebSocket error:", err);
    socket.onclose = () => console.log("⚠️ WebSocket disconnected");

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if(data.chatType !== "public") return;

        const messages = document.getElementById("messages");
        if(!messages) return;

        const div = document.createElement("div");
        div.textContent = `[${data.sender}] ${data.message}`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    };

    window.sendPublicMessage = function() {
        const input = document.getElementById("messageInput");
        if(!input || !input.value.trim()) return;

        socket.send(JSON.stringify({
            chatType: "public",
            message: input.value,
            sender: anonymousId
        }));

        input.value = "";
    };
});
