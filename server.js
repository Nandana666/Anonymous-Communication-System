const express = require("express");
const http = require("http");
const path = require("path");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);

// WebSocket server
require("./websocket")(server);

const PORT = 5000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
