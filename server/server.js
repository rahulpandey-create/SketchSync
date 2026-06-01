const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const {
  appendStroke,
  getRoomState,
} = require("./services/boardStore");

(async () => {
  await appendStroke("test-room", {
    id: 1,
    points: [1, 2, 3],
  });

  const room = await getRoomState("test-room");

  console.log(room);
})();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// --- In-memory store ---
// roomId -> { strokes[], activeStrokes{id->stroke}, users{socketId->{name,color}} }
const rooms = new Map();

const USER_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16'
];

let globalColorIdx = 0;

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      strokes: [],
      activeStrokes: new Map(),
      users: new Map()
    });
  }
  return rooms.get(roomId);
}

function getUserList(room) {
  return Array.from(room.users.entries()).map(([id, u]) => ({ id, ...u }));
}

// --- Socket.IO ---
io.on('connection', (socket) => {
  let roomId = null;
  let myColor = null;
  let myName = null;

  // join-room: { room: string, name: string }
  socket.on('join-room', ({ room, name }) => {
    roomId = room.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    myName = (name || '').trim() || `Artist ${Math.floor(Math.random() * 900) + 100}`;
    myColor = USER_COLORS[globalColorIdx % USER_COLORS.length];
    globalColorIdx++;

    socket.join(roomId);
    const roomData = getRoom(roomId);
    roomData.users.set(socket.id, { name: myName, color: myColor });

    // Send full board state + user list to the new joiner
    socket.emit('init', {
      strokes: roomData.strokes,
      users: getUserList(roomData),
      you: { id: socket.id, color: myColor, name: myName }
    });

    // Tell everyone else
    socket.to(roomId).emit('user-joined', {
      id: socket.id,
      name: myName,
      color: myColor
    });

    console.log(`[room:${roomId}] ${myName} joined (${socket.id.slice(0, 6)})`);
  });

  // stroke-begin: user starts drawing
  // { strokeId, tool, color, size, x, y }  (x,y normalized 0-1)
  socket.on('stroke-begin', ({ strokeId, tool, color, size, x, y }) => {
    if (!roomId) return;
    const roomData = getRoom(roomId);
    const stroke = {
      id: strokeId,
      userId: socket.id,
      tool,
      color,
      size,
      points: [{ x, y }]
    };
    roomData.activeStrokes.set(strokeId, stroke);
    socket.to(roomId).emit('stroke-begin', { strokeId, tool, color, size, x, y });
  });

  // stroke-point: user adds a point
  // { strokeId, x, y }
  socket.on('stroke-point', ({ strokeId, x, y }) => {
    if (!roomId) return;
    const roomData = getRoom(roomId);
    const stroke = roomData.activeStrokes.get(strokeId);
    if (stroke) stroke.points.push({ x, y });
    socket.to(roomId).emit('stroke-point', { strokeId, x, y });
  });

  // stroke-end: user lifts pen
  // { strokeId }
  socket.on('stroke-end', ({ strokeId }) => {
    if (!roomId) return;
    const roomData = getRoom(roomId);
    const stroke = roomData.activeStrokes.get(strokeId);
    if (stroke) {
      // Only save if it has at least 1 point
      if (stroke.points.length >= 1) {
        roomData.strokes.push(stroke);
        // Cap history at 2000 strokes per room to avoid memory bloat
        if (roomData.strokes.length > 2000) {
          roomData.strokes = roomData.strokes.slice(-2000);
        }
      }
      roomData.activeStrokes.delete(strokeId);
    }
    socket.to(roomId).emit('stroke-end', { strokeId });
  });

  // board-clear: someone clears the board
  socket.on('board-clear', () => {
    if (!roomId) return;
    const roomData = getRoom(roomId);
    roomData.strokes = [];
    roomData.activeStrokes.clear();
    io.to(roomId).emit('board-clear');
    console.log(`[room:${roomId}] board cleared by ${myName}`);
  });

  // cursor-move: pointer position
  // { x, y } normalized 0-1
  socket.on('cursor-move', ({ x, y }) => {
    if (!roomId) return;
    socket.to(roomId).emit('cursor-move', { id: socket.id, x, y });
  });

  // cursor-leave: pointer left canvas
  socket.on('cursor-leave', () => {
    if (!roomId) return;
    socket.to(roomId).emit('cursor-leave', { id: socket.id });
  });

  socket.on('disconnect', () => {
    if (!roomId) return;
    const roomData = rooms.get(roomId);
    if (roomData) {
      roomData.users.delete(socket.id);
      // Clean up any active strokes from this user
      for (const [sid, stroke] of roomData.activeStrokes.entries()) {
        if (stroke.userId === socket.id) {
          roomData.activeStrokes.delete(sid);
        }
      }
      // Remove empty rooms after a delay
      if (roomData.users.size === 0) {
        setTimeout(() => {
          const r = rooms.get(roomId);
          if (r && r.users.size === 0) rooms.delete(roomId);
        }, 5 * 60 * 1000); // 5 min
      }
      socket.to(roomId).emit('user-left', { id: socket.id });
      console.log(`[room:${roomId}] ${myName} left`);
    }
  });
});

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    uptime: Math.round(process.uptime())
  });
});

// --- Start ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎨 Whiteboard server listening on port ${PORT}`);
});