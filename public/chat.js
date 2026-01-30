document.addEventListener("DOMContentLoaded", () => {

    // --------------------
    // Anonymous ID
    // --------------------
    let anonymousId = Math.random().toString(36).substring(2,10);
    const idEl = document.getElementById("anonId");
    if(idEl) idEl.textContent = anonymousId;

    setInterval(() => {
        anonymousId = Math.random().toString(36).substring(2,10);
        if(idEl) idEl.textContent = anonymousId;
    }, 10000);

    // --------------------
    // WebSocket
    // --------------------
    // Automatically choose ws or wss and correct host
const protocol =
    location.protocol === "https:" ? "wss" : "ws";

const socket = new WebSocket(`${protocol}://${location.host}`);


    socket.onopen = () => console.log("✅ WebSocket connected");
    socket.onerror = (err) => console.error("❌ WebSocket error:", err);
    socket.onclose = () => {
    console.log("⚠️ WebSocket disconnected — reconnecting...");
    setTimeout(() => location.reload(), 3000);
};


   socket.onmessage = async (event) => {

    let data;

    try {
        data = JSON.parse(event.data);
    } catch {
        console.error("Invalid WebSocket message:", event.data);
        return;
    }


        // --------------------
        // Public messages (existing functionality)
        // --------------------
        if(data.chatType === "public") {
            const messages = document.getElementById("messages");
            if(!messages) return;
            const div = document.createElement("div");
            div.textContent = `[${data.sender}] ${data.message}`;
            messages.appendChild(div);
            messages.scrollTop = messages.scrollHeight;
        }

        // --------------------
        // Private messages (new)
        // --------------------
        else if(data.chatType === "private") {
            if(!sharedKey) return; // key not ready
            const decrypted = await decryptMessage(data.message);
            appendPrivateMessage(data.sender, decrypted);
        }

        // --------------------
        // Private key exchange (ECDH)
        // --------------------
        else if(data.type === "key-exchange" && data.anonId !== anonymousId) {
            // import the other user's public key
            const otherPubKey = await window.crypto.subtle.importKey(
                "jwk",
                data.publicKey,
                { name: "ECDH", namedCurve: "P-256" },
                true,
                []
            );

            // derive shared AES key
            sharedKey = await window.crypto.subtle.deriveKey(
                { name: "ECDH", public: otherPubKey },
                myECDHKeyPair.privateKey,
                { name: "AES-GCM", length: 256 },
                false,
                ["encrypt", "decrypt"]
            );

            console.log("🔒 Shared AES key established!");
        }
    };

    // --------------------
    // Public message sender (existing)
    // --------------------
    window.sendPublicMessage = function() {
        const input = document.getElementById("messageInput");
        if(!input || !input.value.trim()) return;
        if(socket.readyState !== WebSocket.OPEN){
    return alert("Connecting to secure network... please wait.");
}
        socket.send(JSON.stringify({
            chatType: "public",
            message: input.value,
            sender: anonymousId
        }));

        input.value = "";
    };

    // --------------------
    // Private chat variables
    // --------------------
    let sharedKey = null;
    let myECDHKeyPair = null;
    let privateRoomCode = null;

    // --------------------
    // Create room (generates room code)
    // --------------------
    window.createRoom = async function() {
        privateRoomCode = Math.random().toString(36).substring(2,8).toUpperCase();
        document.getElementById("generatedRoom").textContent = `Room Code: ${privateRoomCode}`;
        await initPrivateChat(privateRoomCode, true);
    };

    // --------------------
    // Join existing room
    // --------------------
    window.joinPrivateRoom = async function() {
        privateRoomCode = document.getElementById("roomInput").value.trim();
        if(!privateRoomCode) return alert("Enter room code!");
        await initPrivateChat(privateRoomCode, false);
    };

    // --------------------
    // Initialize private chat with ECDH
    // --------------------
    async function initPrivateChat(room, isCreator) {
        // generate ECDH key pair
        myECDHKeyPair = await window.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey"]
        );

        // export public key to share
        const myPublicKeyJwk = await window.crypto.subtle.exportKey("jwk", myECDHKeyPair.publicKey);

        // join room and send public key
        socket.send(JSON.stringify({ type: "join-private", room, anonId: anonymousId }));
        socket.send(JSON.stringify({ type: "key-exchange", room, anonId: anonymousId, publicKey: myPublicKeyJwk }));
    }

    // --------------------
    // Send private message
    // --------------------
    window.sendPrivateMessage = async function() {
        const input = document.getElementById("privateMessageInput");
        if(!input || !input.value.trim() || !sharedKey) return alert("Message or key missing!");

        const encryptedMsg = await encryptMessage(input.value);
        socket.send(JSON.stringify({
            chatType: "private",
            room: privateRoomCode,
            message: encryptedMsg,
            sender: anonymousId
        }));

        appendPrivateMessage("You", input.value);
        input.value = "";
    };

    // --------------------
    // AES-GCM Encryption / Decryption
    // --------------------
    async function encryptMessage(msg) {
        const encoder = new TextEncoder();
        const data = encoder.encode(msg);
        const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV

        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            sharedKey,
            data
        );

        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encrypted), iv.length);

        return btoa(String.fromCharCode(...combined));
    }

    async function decryptMessage(ciphertext) {
        const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);

        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            sharedKey,
            data
        );

        return new TextDecoder().decode(decrypted);
    }

    // --------------------
    // Append private message to chat
    // --------------------
    function appendPrivateMessage(sender, msg) {
        const messages = document.getElementById("messages");
        if(!messages) return;
        const div = document.createElement("div");
        div.innerHTML = `<b>${sender}:</b> ${msg}`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }

});
