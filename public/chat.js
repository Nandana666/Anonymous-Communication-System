document.addEventListener("DOMContentLoaded", async () => {

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
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${location.host}`);
    function safeSend(data) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    } else {
        console.log("Socket not ready, waiting...");
        setTimeout(() => safeSend(data), 200);
    }
}
    socket.onopen = () => console.log("✅ WebSocket connected");
    socket.onerror = (err) => console.error("❌ WebSocket error:", err);
    socket.onclose = () => {
    console.log("⚠️ WebSocket disconnected");

    verified = false;
    sharedKey = null;

    document.getElementById("secureStatus").textContent =
        "Connection lost. Refresh manually.";
};

    // --------------------
    // 🔐 Identity Key (Persistent)
    // --------------------
    async function getIdentityKeyPair() {
        let stored = localStorage.getItem("identityKey");

        if (!stored) {
            const keyPair = await crypto.subtle.generateKey(
                { name: "ECDSA", namedCurve: "P-256" },
                true,
                ["sign", "verify"]
            );

            const exported = {
                public: await crypto.subtle.exportKey("jwk", keyPair.publicKey),
                private: await crypto.subtle.exportKey("jwk", keyPair.privateKey)
            };

            localStorage.setItem("identityKey", JSON.stringify(exported));
            return keyPair;
        }

        const parsed = JSON.parse(stored);

        return {
            publicKey: await crypto.subtle.importKey(
                "jwk", parsed.public,
                { name: "ECDSA", namedCurve: "P-256" },
                true, ["verify"]
            ),
            privateKey: await crypto.subtle.importKey(
                "jwk", parsed.private,
                { name: "ECDSA", namedCurve: "P-256" },
                true, ["sign"]
            )
        };
    }

    let identityKeys = await getIdentityKeyPair();
    let sessionKeyPair = null;
    let sharedKey = null;
    let privateRoomCode = null;
    let verified = false;

    // --------------------
    // Create Private Room
    // --------------------
   window.createRoom = async function() {

    try {

        privateRoomCode =
            Math.random().toString(36).substring(2,8).toUpperCase();

        document.getElementById("generatedRoom").textContent =
            `Room Code: ${privateRoomCode}`;

        // 🔐 Always regenerate fresh key
        sessionKeyPair = await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey"]
        );

        if (!sessionKeyPair || !sessionKeyPair.publicKey) {
            alert("Failed to generate session key.");
            return;
        }

        safeSend({
    type: "join-private",
    room: privateRoomCode,
    anonId: anonymousId
});

    } catch (err) {
        console.error("createRoom error:", err);
        alert("Crypto initialization failed.");
    }
};

    // --------------------
    // Join Private Room
    // --------------------
    window.joinPrivateRoom = async function() {

    privateRoomCode = document.getElementById("roomInput").value.trim();
    if(!privateRoomCode) return alert("Enter room code!");

    sessionKeyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
    );

    safeSend({
    type: "join-private",
    room: privateRoomCode,
    anonId: anonymousId
});
};

    

    // --------------------
    // WebSocket Messages
    // --------------------
    socket.onmessage = async (event) => {

        let data;
        try {
            data = JSON.parse(event.data);
        } catch {
            return;
        }

        // Public Chat
        if(data.chatType === "public") {
            const messages = document.getElementById("messages");
            if(!messages) return;
            const div = document.createElement("div");
            div.textContent = `[${data.sender}] ${data.message}`;
            messages.appendChild(div);
            messages.scrollTop = messages.scrollHeight;
        }
        // 🔐 Trigger handshake when both users present
if (data.type === "start-handshake") {

    // If session key not ready, regenerate
    if (!sessionKeyPair) {
        sessionKeyPair = await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey"]
        );
    }

    if (!privateRoomCode) return;

    const publicRaw =
        await crypto.subtle.exportKey("raw", sessionKeyPair.publicKey);

    const signature =
        await crypto.subtle.sign(
            { name: "ECDSA", hash: "SHA-256" },
            identityKeys.privateKey,
            publicRaw
        );

    safeSend({
        type: "signed-ecdh",
        room: privateRoomCode,
        sessionPublicKey: btoa(String.fromCharCode(...new Uint8Array(publicRaw))),
        signature: btoa(String.fromCharCode(...new Uint8Array(signature))),
        identityPublicKey: await crypto.subtle.exportKey("jwk", identityKeys.publicKey)
    });
}
        // 🔐 Handle Signed ECDH (FULL 2-WAY HANDSHAKE FIX)
if(data.type === "signed-ecdh" && 
   data.room === privateRoomCode && 
   !verified) {
    if(!sessionKeyPair){
    console.log("Session key not ready yet");
    return;
}
    const identityPublicKey =
        await crypto.subtle.importKey(
            "jwk",
            data.identityPublicKey,
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["verify"]
        );

    const sessionPublicRaw =
        Uint8Array.from(atob(data.sessionPublicKey), c => c.charCodeAt(0));

    const signature =
        Uint8Array.from(atob(data.signature), c => c.charCodeAt(0));

    const valid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        identityPublicKey,
        signature,
        sessionPublicRaw
    );

    if(!valid){
        alert("Signature verification failed!");
        return;
    }

    const importedKey =
        await crypto.subtle.importKey(
            "raw",
            sessionPublicRaw,
            { name: "ECDH", namedCurve: "P-256" },
            true,
            []
        );

    sharedKey = await crypto.subtle.deriveKey(
        { name: "ECDH", public: importedKey },
        sessionKeyPair.privateKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );

    verified = true;
    console.log("🔐 Secure private session established");

    // 🔁 Send back own signed key if not already responded
    if(!data.alreadyResponded){

        const myPublicRaw =
            await crypto.subtle.exportKey("raw", sessionKeyPair.publicKey);

        const mySignature =
            await crypto.subtle.sign(
                { name: "ECDSA", hash: "SHA-256" },
                identityKeys.privateKey,
                myPublicRaw
            );

        safeSend({
            type: "signed-ecdh",
            room: privateRoomCode,
            sessionPublicKey: btoa(String.fromCharCode(...new Uint8Array(myPublicRaw))),
            signature: btoa(String.fromCharCode(...new Uint8Array(mySignature))),
            identityPublicKey: await crypto.subtle.exportKey("jwk", identityKeys.publicKey),
            alreadyResponded: true
        });
    }
}

        // 🔐 Encrypted Private Message
        if (data.chatType === "private") {

    if (!verified || !sharedKey) {
        console.log("Private message received before secure session ready");
        return;
    }

    try {

        const combined =
            Uint8Array.from(atob(data.message), c => c.charCodeAt(0));

        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const decrypted =
            await crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                sharedKey,
                ciphertext
            );

        appendPrivateMessage(
            data.sender,
            new TextDecoder().decode(decrypted)
        );

    } catch (err) {
        console.error("Decryption failed:", err);
    }
}
    };

    // --------------------
    // Send Encrypted Private Message
    // --------------------
    window.sendPrivateMessage = async function() {

        if(!verified || !sharedKey)
            return alert("Secure session not established");

        const input =
            document.getElementById("privateMessageInput");

        if(!input || !input.value.trim()) return;

        const iv =
            crypto.getRandomValues(new Uint8Array(12));

        const encrypted =
            await crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                sharedKey,
                new TextEncoder().encode(input.value)
            );

        const combined =
            new Uint8Array(iv.length + encrypted.byteLength);

        combined.set(iv);
        combined.set(new Uint8Array(encrypted), 12);

        safeSend({
            chatType: "private",
            room: privateRoomCode,
            message: btoa(String.fromCharCode(...combined)),
            sender: anonymousId
        });

        appendPrivateMessage("You", input.value);
        input.value = "";
    };

        function appendPrivateMessage(sender, msg) {
        const messages = document.getElementById("messages");
        if(!messages) return;
        const div = document.createElement("div");
        div.innerHTML = `<b>${sender}:</b> ${msg}`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }
        // --------------------
    // Auto Join From Invite Link
    // --------------------
    const params = new URLSearchParams(window.location.search);
const inviteRoom = params.get("room");

if(inviteRoom){

    privateRoomCode = inviteRoom;

    sessionKeyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
    );

    safeSend({
        type: "join-private",
        room: privateRoomCode,
        anonId: anonymousId
    });
}
    // --------------------
    // 🔗 Share Secure Invite
    // --------------------
    window.shareInvite = async function() {

        if(!privateRoomCode){
            return alert("Create room first!");
        }

        const inviteLink =
            `${location.origin}${location.pathname}?room=${privateRoomCode}`;

        document.getElementById("inviteLink").textContent = inviteLink;

        if(navigator.share){
            try{
                await navigator.share({
                    title: "Secure Private Chat",
                    text: "Join my secure private chat:",
                    url: inviteLink
                });
            } catch {}
        }
        else {
            await navigator.clipboard.writeText(inviteLink);
            alert("Invite link copied to clipboard!");
        }
    };

});
