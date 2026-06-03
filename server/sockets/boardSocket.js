const {
  getRoomState,
  appendStroke,
  clearRoom,
  undoStroke,
  redoStroke,
} = require("../services/boardStore");

const USER_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

let globalColorIdx = 0;

const runtimeRooms = new Map();

function normalizeRoomId(room) {
  return String(room || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

function getRuntimeRoom(roomId) {
  if (!runtimeRooms.has(roomId)) {
    runtimeRooms.set(roomId, {
      users: new Map(),
      activeStrokes: new Map(),
    });
  }

  return runtimeRooms.get(roomId);
}

function getUserList(room) {
  return Array.from(room.users.entries()).map(([id, user]) => ({ id, ...user }));
}

async function emitBoardState(io, roomId) {
  const state = await getRoomState(roomId);
  io.to(roomId).emit("board-state", {
    strokes: state.strokes,
    redoStrokes: state.redoStrokes,
    updatedAt: state.updatedAt,
  });
}

function registerBoardSockets(io) {
  io.on("connection", (socket) => {
    let roomId = null;
    let myName = null;
    let myColor = null;

    console.log("CLIENT CONNECTED:", socket.id);

    socket.on("join-room", async ({ room, name }) => {
      const nextRoomId = normalizeRoomId(room);
      if (!nextRoomId) return;

      if (roomId && roomId !== nextRoomId) {
        const prevRoom = runtimeRooms.get(roomId);
        if (prevRoom) {
          prevRoom.users.delete(socket.id);
          for (const [strokeId, stroke] of prevRoom.activeStrokes.entries()) {
            if (stroke.userId === socket.id) {
              prevRoom.activeStrokes.delete(strokeId);
            }
          }
        }
        socket.leave(roomId);
      }

      roomId = nextRoomId;
      socket.data.roomId = roomId;

      myName = (name || "").trim() || `Artist ${Math.floor(Math.random() * 900) + 100}`;
      myColor = USER_COLORS[globalColorIdx % USER_COLORS.length];
      globalColorIdx += 1;

      socket.join(roomId);

      const runtimeRoom = getRuntimeRoom(roomId);
      runtimeRoom.users.set(socket.id, { name: myName, color: myColor });

      const persistedState = await getRoomState(roomId);
      console.log("SENDING INIT FOR ROOM:", roomId);
      socket.emit("init", {
        strokes: persistedState.strokes,
        redoStrokes: persistedState.redoStrokes,
        users: getUserList(runtimeRoom),
        you: { id: socket.id, color: myColor, name: myName },
      });

      socket.to(roomId).emit("user-joined", {
        id: socket.id,
        name: myName,
        color: myColor,
      });

      console.log(`[room:${roomId}] ${myName} joined (${socket.id.slice(0, 6)})`);
    });

    socket.on("stroke-begin", ({ strokeId, tool, color, size, x, y }) => {
      const activeRoomId = socket.data.roomId || roomId;
      if (!activeRoomId) return;

      const runtimeRoom = getRuntimeRoom(activeRoomId);
      runtimeRoom.activeStrokes.set(strokeId, {
        id: strokeId,
        userId: socket.id,
        tool,
        color,
        size,
        points: [{ xNorm: x, yNorm: y }],
      });

      socket.to(activeRoomId).emit("stroke-begin", { strokeId, tool, color, size, x, y });
    });

    socket.on("stroke-point", ({ strokeId, x, y }) => {
      const activeRoomId = socket.data.roomId || roomId;
      if (!activeRoomId) return;

      const runtimeRoom = getRuntimeRoom(activeRoomId);
      const stroke = runtimeRoom.activeStrokes.get(strokeId);

      if (stroke) {
        stroke.points.push({ xNorm: x, yNorm: y });
      }

      socket.to(activeRoomId).emit("stroke-point", { strokeId, x, y });
    });

    socket.on("stroke-end", async ({ strokeId }) => {
      const activeRoomId = socket.data.roomId || roomId;
      if (!activeRoomId) {
        console.log("NO ROOM ID");
        return;
      }

      console.log("stroke end fired", strokeId);

      const runtimeRoom = getRuntimeRoom(activeRoomId);
      const stroke = runtimeRoom.activeStrokes.get(strokeId);

      console.log("active strokes size:", runtimeRoom.activeStrokes.size);
      console.log("stroke found:", !!stroke);

      if (stroke) {
        await appendStroke(activeRoomId, stroke);
        runtimeRoom.activeStrokes.delete(strokeId);
      }

      socket.to(activeRoomId).emit("stroke-end", { strokeId });
      await emitBoardState(io, activeRoomId);
    });

    socket.on("board-clear", async () => {
      const activeRoomId = socket.data.roomId || roomId;
      if (!activeRoomId) return;

      const runtimeRoom = getRuntimeRoom(activeRoomId);
      runtimeRoom.activeStrokes.clear();

      await clearRoom(activeRoomId);
      io.to(activeRoomId).emit("board-clear");
      await emitBoardState(io, activeRoomId);

      console.log(`[room:${activeRoomId}] board cleared by ${myName}`);
    });

    socket.on("undo-board", async () => {
      const activeRoomId = socket.data.roomId || roomId;
      if (!activeRoomId) return;

      await undoStroke(activeRoomId);
      await emitBoardState(io, activeRoomId);
    });

    socket.on("redo-board", async () => {
      const activeRoomId = socket.data.roomId || roomId;
      if (!activeRoomId) return;

      await redoStroke(activeRoomId);
      await emitBoardState(io, activeRoomId);
    });

    socket.on("cursor-move", ({ x, y }) => {
      const activeRoomId = socket.data.roomId || roomId;
      if (!activeRoomId) return;
      socket.to(activeRoomId).emit("cursor-move", { id: socket.id, x, y });
    });

    socket.on("cursor-leave", () => {
      const activeRoomId = socket.data.roomId || roomId;
      if (!activeRoomId) return;
      socket.to(activeRoomId).emit("cursor-leave", { id: socket.id });
    });

    socket.on("disconnect", () => {
      const activeRoomId = socket.data.roomId || roomId;
      if (!activeRoomId) return;

      const runtimeRoom = runtimeRooms.get(activeRoomId);
      if (runtimeRoom) {
        runtimeRoom.users.delete(socket.id);

        for (const [strokeId, stroke] of runtimeRoom.activeStrokes.entries()) {
          if (stroke.userId === socket.id) {
            runtimeRoom.activeStrokes.delete(strokeId);
          }
        }

        if (runtimeRoom.users.size === 0) {
          setTimeout(() => {
            const current = runtimeRooms.get(activeRoomId);
            if (current && current.users.size === 0) {
              runtimeRooms.delete(activeRoomId);
            }
          }, 5 * 60 * 1000);
        }

        socket.to(activeRoomId).emit("user-left", { id: socket.id });
        console.log(`[room:${activeRoomId}] ${myName} left`);
      }
    });
  });
}

module.exports = {
  registerBoardSockets,
};