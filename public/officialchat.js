let socket = null;
let isConnecting = false;

let departmentPublicKey = null;
let citizenKeyPair = null;
let replyToken = null;

document.addEventListener("DOMContentLoaded", () => {


    function strongRandom(len = 8){
        const arr = new Uint8Array(len);
        crypto.getRandomValues(arr);
        return Array.from(arr)
            .map(b => b.toString(16).padStart(2,'0'))
            .join('')
            .substring(0,len);
    }

    const anonymousId = strongRandom(8);
    document.getElementById("anonID").textContent = anonymousId;
    document.getElementById("department").addEventListener("change", async () => {
    await fetchDepartmentKey();
});
    replyToken = sessionStorage.getItem("replyToken");

    connectSocket();

});

// ================= CONNECT SOCKET =================
function connectSocket(){

    if(isConnecting) return;
    isConnecting = true;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}/citizen`);

    socket.onopen = async () => {

        isConnecting = false;
        document.getElementById("sendBtn").disabled = false;
        document.getElementById("sendBtn").innerText = "Send";

        await fetchDepartmentKey();
    };

    socket.onmessage = async (event) => {
        console.log("SERVER MESSAGE:", event.data);
        let data;
        try { data = JSON.parse(event.data); }
        catch { return; }

        // NEW TOKEN FROM SERVER
        if(data.replyToken && !replyToken){

    replyToken = data.replyToken;

    sessionStorage.setItem("replyToken", replyToken);

    await persistCitizenKeys(replyToken);

    setTimeout(() => {
        prompt("Copy and save your Reply Token:", replyToken);
    },100);

    return;
}

        // HISTORY
        if(data.chatType === "history"){
            document.getElementById("chatBox").innerHTML = "";

            for(const m of data.messages){

    let text;

    try{
        text = await decryptMessage(m);
    }catch(err){
        console.log("Decrypt failed:", err);
        text = "[Decryption failed]";
    }
                addMessage(
                    m.from === "official" ? "Official" : "You",
                    text,
                    m.timestamp
                );
            }
            return;
        }

        // OFFICIAL REPLY
        // OFFICIAL REPLY
if(data.chatType === "otc"){

    // If replyToken not yet stored, store it
    if(!replyToken){
        replyToken = data.replyToken;
        sessionStorage.setItem("replyToken", replyToken);
        document.getElementById("replyToken").textContent = replyToken;
    }

    if(data.replyToken === replyToken){

        let text;

        try{
            text = await decryptMessage(data);
        }catch(err){
            console.log("Decrypt failed:", err);
            text = "[Decryption failed]";
        }

        addMessage("Official", text, data.timestamp);
    }
}
    };
}

// ================= SEND MESSAGE =================
window.sendC2OMessage = async function(){

    const input = document.getElementById("messageInput");
    const dept = document.getElementById("department").value;

    if(!input.value.trim())
        return alert("Enter a message!");

    if(!departmentPublicKey)
        return alert("Department key not ready yet.");

    if(!citizenKeyPair){

    // Create a temporary keypair first
    citizenKeyPair = await crypto.subtle.generateKey(
        { name:"ECDH", namedCurve:"P-256" },
        true,
        ["deriveBits"]
    );
}

    const publicKeyRaw = await crypto.subtle.exportKey(
        "raw",
        citizenKeyPair.publicKey
    );

    const sharedSecret = await crypto.subtle.deriveBits(
        { name: "ECDH", public: departmentPublicKey },
        citizenKeyPair.privateKey,
        256
    );

    const aesKey = await crypto.subtle.importKey(
        "raw",
        await crypto.subtle.digest("SHA-256", sharedSecret),
        { name: "AES-GCM" },
        false,
        ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        new TextEncoder().encode(input.value)
    );

    socket.send(JSON.stringify({
        chatType: "cto",
        replyToken: replyToken || null,
        department: dept,
        ciphertext: bufferToHex(encrypted),
        iv: bufferToHex(iv),
        citizenPublicKey: bufferToHex(publicKeyRaw),
        timestamp: Date.now()
    }));

    addMessage("You", input.value, Date.now());
    input.value = "";
};

// ================= LOAD OR CREATE KEYPAIR =================
async function loadOrCreateCitizenKeys(){

    if(replyToken){

        const storedPrivate = localStorage.getItem("citizenPrivate_" + replyToken);
        const storedPublic  = localStorage.getItem("citizenPublic_" + replyToken);

        if(storedPrivate && storedPublic){

            const privateKey = await crypto.subtle.importKey(
                "pkcs8",
                hexToBuffer(storedPrivate),
                { name: "ECDH", namedCurve: "P-256" },
                false,
                ["deriveBits"]
            );

            const publicKey = await crypto.subtle.importKey(
                "raw",
                hexToBuffer(storedPublic),
                { name: "ECDH", namedCurve: "P-256" },
                true,
                []
            );

            citizenKeyPair = { privateKey, publicKey };
            return;
        }
    }

    citizenKeyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveBits"]
    );
}

// ================= PERSIST KEYS =================
async function persistCitizenKeys(token){

    const privateRaw = await crypto.subtle.exportKey(
        "pkcs8",
        citizenKeyPair.privateKey
    );

    const publicRaw = await crypto.subtle.exportKey(
        "raw",
        citizenKeyPair.publicKey
    );

    localStorage.setItem(
        "citizenPrivate_" + token,
        bufferToHex(privateRaw)
    );

    localStorage.setItem(
        "citizenPublic_" + token,
        bufferToHex(publicRaw)
    );
}

// ================= FETCH DEPARTMENT KEY =================
async function fetchDepartmentKey(){

    const dept = document.getElementById("department").value;

    const response = await fetch(`/api/department-key?department=${dept}`);
    const data = await response.json();

    if(!data.publicKey){
        alert("Department not online yet.");
        return;
    }

    departmentPublicKey = await crypto.subtle.importKey(
        "raw",
        hexToBuffer(data.publicKey),
        { name: "ECDH", namedCurve: "P-256" },
        true,
        []
    );
}

// ================= DECRYPT =================
async function decryptMessage(data){

    if(!citizenKeyPair){
        await loadOrCreateCitizenKeys();
    }
    // Ensure department key is loaded
    if(!departmentPublicKey){
        await fetchDepartmentKey();
    }

    if(!data.ciphertext) return "[Invalid]";

    // ALWAYS use department public key for shared secret
    let officialKey = departmentPublicKey;

if(data.officialPublicKey){
    officialKey = await crypto.subtle.importKey(
        "raw",
        hexToBuffer(data.officialPublicKey),
        { name: "ECDH", namedCurve: "P-256" },
        true,
        []
    );
}

const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: officialKey },
    citizenKeyPair.privateKey,
    256
);

    const aesKey = await crypto.subtle.importKey(
        "raw",
        await crypto.subtle.digest("SHA-256", sharedSecret),
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: hexToBuffer(data.iv) },
        aesKey,
        hexToBuffer(data.ciphertext)
    );

    return new TextDecoder().decode(decrypted);
}
// ================= UI =================
function addMessage(sender, text, timestamp){

    const chatBox = document.getElementById("chatBox");

    const div = document.createElement("div");
    div.innerHTML = `
        <b>${sender}</b>: ${text}
        <span style="color:gray;font-size:0.8em;">
        (${new Date(timestamp).toLocaleTimeString()})
        </span>
    `;

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ================= HELPERS =================
function bufferToHex(buffer){
    return [...new Uint8Array(buffer)]
        .map(b => b.toString(16).padStart(2,"0"))
        .join("");
}

function hexToBuffer(hex){
    const bytes = new Uint8Array(hex.length/2);
    for(let i=0;i<bytes.length;i++)
        bytes[i] = parseInt(hex.substr(i*2,2),16);
    return bytes;
}
// ================= CHECK EXISTING TOKEN =================
async function checkMessages(){

    const token = document.getElementById("checkTokenInput").value.trim();
    const dept  = document.getElementById("department").value;

    if(!token) return alert("Enter your Reply Token");

    if(!socket || socket.readyState !== WebSocket.OPEN){
        return alert("Connection not ready yet.");
    }

    replyToken = token;
    sessionStorage.setItem("replyToken", token);

    // 🔑 Ensure department key is loaded
    if(!departmentPublicKey){
        await fetchDepartmentKey();
    }

    // 🔑 Load citizen keys
    await loadOrCreateCitizenKeys();

    socket.send(JSON.stringify({
        chatType: "loadHistory",
        department: dept,
        replyToken: token
    }));
}