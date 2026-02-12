const express = require("express");
const http = require("http");
const path = require("path");
const memoryStore = require("./memoryStore");
const websocket = require("./websocket");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
websocket(server);

server.listen(5000, () => {
    console.log("✅ Server running at http://localhost:5000");
});
