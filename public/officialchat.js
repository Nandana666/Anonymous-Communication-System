let socket = null;
let isConnecting = false;


document.addEventListener("DOMContentLoaded", () => {

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

        if(idEl)
            idEl.textContent = anonymousId;
    }

    rotateAnon(); // initial
    setInterval(rotateAnon, 10000); // every 10 seconds



    // ==============================
    // Stable Reply Token (REAL Identity)
    // ==============================
    let replyToken = sessionStorage.getItem("replyToken");

    if(!replyToken){
        replyToken = strongRandom(32) + Date.now();
        sessionStorage.setItem("replyToken", replyToken);
    }

    const replyEl = document.getElementById("replyToken");
    if(replyEl)
        replyEl.textContent = replyToken;



    // ==============================
    // Clipboard (Tor Safe)
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
    // WebSocket (Auto-Reconnect)
    // ==============================

    //let socket;

    function connectSocket(){

    // ✅ Prevent duplicate connections
    if(isConnecting) return;

    // ✅ If socket already alive → do nothing
    if(socket && (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
    )){
        return;
    }

    isConnecting = true;
    socket = new WebSocket("ws://" + location.host + "/citizen");

    


    socket.onopen = () => {

        console.log("✅ Connected");

        isConnecting = false;

        const btn = document.getElementById("sendBtn");
        if(btn){
            btn.disabled = false;
            btn.innerText = "Send";
        }
    };


    socket.onerror = () => {

        console.log("⚠️ WebSocket error");

        // Let onclose handle reconnect
        socket.close();
    };


    socket.onclose = () => {

        console.log("⚠️ Socket closed — retrying in 5s");

        isConnecting = false;

        const btn = document.getElementById("sendBtn");
        if(btn){
            btn.disabled = true;
            btn.innerText = "Reconnecting...";
        }

        // ⭐ Increase delay (Tor needs it)
        setTimeout(connectSocket, 5000);
    };


    socket.onmessage = (event) => {

        let data;

        try{
            data = JSON.parse(event.data);
        }catch{
            return;
        }

        if(data.replyToken !== replyToken)
            return;

        const chatBox = document.getElementById("chatBox");
        if(!chatBox) return;

        const div = document.createElement("div");

        const time = new Date(data.timestamp)
            .toLocaleTimeString();

        div.innerHTML =
        `<b>Official [${data.department}]</b>: 
        ${data.message}
        <span style="color:gray;font-size:0.8em;">
        (${time})
        </span>`;

        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    };
}


    connectSocket();



    // ==============================
    // Send Citizen → Official
    // ==============================
    window.sendC2OMessage = function(){

        const input = document.getElementById("messageInput");
        const dept = document.getElementById("department").value;

        if(!input || !input.value.trim())
            return alert("Enter a message!");

       if(!socket || socket.readyState !== WebSocket.OPEN){

    alert("Secure connection not ready yet...");
    return;
}


        const message = input.value.trim();
        const timestamp = Date.now();

        const payload = {

            chatType: "cto",

            // rotating mask
            sender: anonymousId,

            // TRUE routing identity
            replyToken: replyToken,

            department: dept,
            message,
            timestamp
        };

        socket.send(JSON.stringify(payload));


        // Local display
        const chatBox = document.getElementById("chatBox");

        const div = document.createElement("div");

        div.innerHTML =
        `<b>You [${dept}]</b>: ${message}
        <span style="color:gray;font-size:0.8em;">
        (${new Date(timestamp).toLocaleTimeString()})
        </span>`;

        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;

        input.value="";
    };

});
