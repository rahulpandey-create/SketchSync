const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { registerBoardSockets } = require("./sockets/boardSocket");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
  });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

registerBoardSockets(io);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🎨 Whiteboard server listening on port ${PORT}`);
});