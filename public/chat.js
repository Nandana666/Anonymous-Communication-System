document.addEventListener("DOMContentLoaded", () => {

    // =============================
    // 🔐 Anonymous ID Generator
    // =============================

    function generateAnonymousId() {
        const array = new Uint8Array(8);
        crypto.getRandomValues(array);

        return Array.from(array)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    let anonymousId = generateAnonymousId();

    function updateIdDisplay() {
        const idElement = document.getElementById("anonId");
        if (idElement) {
            idElement.textContent = anonymousId;
        }
    }

    updateIdDisplay();

    // Change ID every 10 seconds
    setInterval(() => {
        anonymousId = generateAnonymousId();
        updateIdDisplay();
    }, 10000);

    // =============================
    // 🌐 WebSocket Connection
    // =============================

    const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    const socket = new WebSocket(protocol + window.location.host);

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const messages = document.getElementById("messages");

        if (!messages) return;

        const div = document.createElement("div");
        div.textContent = `[${data.sender}] ${data.message}`;
        messages.appendChild(div);
    };

    // =============================
    // 📢 Public Chat
    // =============================

    window.sendPublicMessage = function () {
        const input = document.getElementById("messageInput");
        if (!input) return;

        const message = input.value;

        socket.send(JSON.stringify({
            type: "public",
            message: message,
            sender: anonymousId
        }));

        input.value = "";
    };

    // =============================
    // 🔒 Private Chat
    // =============================

    window.joinPrivateRoom = function () {
        const room = document.getElementById("roomInput").value;

        socket.send(JSON.stringify({
            type: "join",
            room: room
        }));

        alert("Joined room: " + room);
    };

    window.sendPrivateMessage = function () {
        const room = document.getElementById("roomInput").value;
        const input = document.getElementById("privateMessageInput");
        if (!input) return;

        const message = input.value;

        socket.send(JSON.stringify({
            type: "private",
            room: room,
            message: message,
            sender: anonymousId
        }));

        input.value = "";
    };

});
