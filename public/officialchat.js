let socket = null;
let isConnecting = false;

document.addEventListener("DOMContentLoaded", () => {
    sessionStorage.removeItem("replyToken");
sessionStorage.removeItem("replyDept");

    // ==============================
    // Strong Random Generator (Tor Safe)
    // ==============================
    function strongRandom(len = 8){
        const arr = new Uint8Array(len);
        crypto.getRandomValues(arr);

        return Array.from(arr)
            .map(b => b.toString(16).padStart(2,'0'))
            .join('')
            .substring(0,len);
    }

    // ==============================
    // Rotating Anonymous ID (DISPLAY ONLY)
    // ==============================
    let anonymousId = strongRandom(8);

    const idEl = document.getElementById("anonID");

    function rotateAnon(){
        anonymousId = strongRandom(8);
        if(idEl) idEl.textContent = anonymousId;
    }

    rotateAnon();
    setInterval(rotateAnon, 10000);

    // ==============================
    // Stable Reply Token (REAL Identity)
    // ==============================
    let replyToken = sessionStorage.getItem("replyToken");

const replyEl = document.getElementById("replyToken");

// Only show token if it exists
if(replyEl){
    replyEl.textContent = replyToken ? replyToken : "";
}


    // ==============================
    // Clipboard
    // ==============================
    window.copyReplyToken = function(){
        const temp = document.createElement("input");
        temp.value = replyToken;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
        alert("Reply token copied!");
    };

    // ==============================
    // WebSocket
    // ==============================
    function connectSocket(){

        if(isConnecting) return;

        if(socket &&
            (socket.readyState === WebSocket.OPEN ||
             socket.readyState === WebSocket.CONNECTING)){
            return;
        }

        isConnecting = true;
        socket = new WebSocket(`ws://${location.host}/citizen`);

        socket.onopen = () => {

            console.log("✅ Connected");
            isConnecting = false;

            const btn = document.getElementById("sendBtn");
            if(btn){
                btn.disabled = false;
                btn.innerText = "Send";
            }

            // AUTO LOAD HISTORY
            // if(replyToken){

            //     const savedDept = sessionStorage.getItem("replyDept");

            //     if(savedDept){

            //         document.getElementById("department").value = savedDept;

            //         socket.send(JSON.stringify({
            //             chatType: "loadHistory",
            //             department: savedDept,
            //             replyToken: replyToken
            //         }));
            //     }
            // }
        };

        socket.onerror = () => {
            socket.close();
        };

        socket.onclose = () => {

            console.log("⚠️ Reconnecting...");
            isConnecting = false;

            const btn = document.getElementById("sendBtn");
            if(btn){
                btn.disabled = true;
                btn.innerText = "Reconnecting...";
            }

            setTimeout(connectSocket, 5000);
        };

        socket.onmessage = (event) => {

            let data;
            try{
                data = JSON.parse(event.data);
            }catch{
                return;
            }

            const chatBox = document.getElementById("chatBox");
            if(!chatBox) return;

            // ================= HISTORY =================
            if(data.chatType === "history"){

                chatBox.innerHTML = "";

                data.messages.forEach(m => {

                    let text = m.message;

                    try{
                        const bytes = CryptoJS.AES.decrypt(text, "my_secret_key_123");
                        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                        if(decrypted) text = decrypted;
                    }catch{}

                    const div = document.createElement("div");

                    const unread =
                        (m.from === "official" && !m.readByCitizen) ? " 🔴" : "";

                    div.innerHTML = `
                        <b>${m.from === "official" ? "Official" : "You"}</b>: 
                        ${text}${unread}
                        <span style="color:gray;font-size:0.8em;">
                        (${new Date(m.timestamp).toLocaleTimeString()})
                        </span>
                    `;

                    chatBox.appendChild(div);
                });

                chatBox.scrollTop = chatBox.scrollHeight;
                return;
            }

            // ================= NEW TOKEN =================
            if(data.type === "newReplyToken"){

                if(!sessionStorage.getItem("replyToken")){

                    alert("⚠️ Save this Reply Token:\n\n" + data.replyToken);

                    sessionStorage.setItem("replyToken", data.replyToken);

                    const dept =
                        document.getElementById("department").value;

                    sessionStorage.setItem("replyDept", dept);

                    replyToken = data.replyToken;

                    if(replyEl) replyEl.textContent = replyToken;
                }

                return;
            }

            // ================= LIVE OFFICIAL MESSAGE =================
            if(data.chatType === "otc" &&
               replyToken &&
               data.replyToken === replyToken){

                let text = data.message;

                try{
                    const bytes = CryptoJS.AES.decrypt(text, "my_secret_key_123");
                    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                    if(decrypted) text = decrypted;
                }catch{}

                const div = document.createElement("div");

                div.innerHTML = `
                    <b>Official [${data.department}]</b>: 
                    ${text}
                    <span style="color:gray;font-size:0.8em;">
                    (${new Date(data.timestamp).toLocaleTimeString()})
                    </span>
                `;

                chatBox.appendChild(div);
                chatBox.scrollTop = chatBox.scrollHeight;

                // Mark as read
                const savedDept = sessionStorage.getItem("replyDept");
                if(savedDept){
                    socket.send(JSON.stringify({
                        chatType: "loadHistory",
                        department: savedDept,
                        replyToken: replyToken
                    }));
                }
            }
        };
    }

    // CONNECT
    connectSocket();

    // ==============================
    // Send Citizen → Official
    // ==============================
    window.sendC2OMessage = function(){

        const input = document.getElementById("messageInput");
        const dept = document.getElementById("department").value;

        if(!input || !input.value.trim())
            return alert("Enter a message!");

        if(!socket || socket.readyState !== WebSocket.OPEN)
            return alert("Secure connection not ready yet...");

        const message = input.value.trim();
        const timestamp = Date.now();

        socket.send(JSON.stringify({
            chatType: "cto",
            sender: anonymousId,
            replyToken: replyToken || null,
            department: dept,
            message,
            timestamp
        }));

        const chatBox = document.getElementById("chatBox");

        const div = document.createElement("div");

        div.innerHTML = `
            <b>You [${dept}]</b>: ${message}
            <span style="color:gray;font-size:0.8em;">
            (${new Date(timestamp).toLocaleTimeString()})
            </span>
        `;

        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;

        input.value="";
    };
// ==============================
// 🔵 Manual Check Using Reply Token
// ==============================

window.checkMessages = function(){

    const tokenInput = document.getElementById("checkTokenInput");
    const dept = document.getElementById("department").value;

    if(!tokenInput.value.trim())
        return alert("Enter your Reply Token!");

    if(!socket || socket.readyState !== WebSocket.OPEN)
        return alert("Not connected yet...");

    const enteredToken = tokenInput.value.trim();

    sessionStorage.setItem("replyToken", enteredToken);
    sessionStorage.setItem("replyDept", dept);

    replyToken = enteredToken;

    socket.send(JSON.stringify({
        chatType: "loadHistory",
        department: dept,
        replyToken: enteredToken
    }));
};

});
