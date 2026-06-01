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
        myName = (name || "").trim() || `Artist ${Math.floor(Math.random() * 900) + 100}`;
        myColor = USER_COLORS[globalColorIdx % USER_COLORS.length];
        globalColorIdx += 1;
  
        socket.join(roomId);
  
        const room = getRuntimeRoom(roomId);
        room.users.set(socket.id, { name: myName, color: myColor });
  
        const persistedState = await getRoomState(roomId);
  
        socket.emit("init", {
          strokes: persistedState.strokes,
          redoStrokes: persistedState.redoStrokes,
          users: getUserList(room),
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
        if (!roomId) return;
  
        const room = getRuntimeRoom(roomId);
        room.activeStrokes.set(strokeId, {
          id: strokeId,
          userId: socket.id,
          tool,
          color,
          size,
          points: [{ xNorm: x, yNorm: y }],
        });
  
        socket.to(roomId).emit("stroke-begin", { strokeId, tool, color, size, x, y });
      });
  
      socket.on("stroke-point", ({ strokeId, x, y }) => {
        if (!roomId) return;
  
        const room = getRuntimeRoom(roomId);
        const stroke = room.activeStrokes.get(strokeId);
  
        if (stroke) {
          stroke.points.push({ xNorm: x, yNorm: y });
        }
  
        socket.to(roomId).emit("stroke-point", { strokeId, x, y });
      });
  
      socket.on("stroke-end", async ({ strokeId }) => {
        if (!roomId) return;
  
        const room = getRuntimeRoom(roomId);
        const stroke = room.activeStrokes.get(strokeId);
  
        if (stroke) {
          if (stroke.points.length > 0) {
            await appendStroke(roomId, stroke);
          }
          room.activeStrokes.delete(strokeId);
        }
  
        socket.to(roomId).emit("stroke-end", { strokeId });
        await emitBoardState(io, roomId);
      });
  
      socket.on("board-clear", async () => {
        if (!roomId) return;
  
        const room = getRuntimeRoom(roomId);
        room.activeStrokes.clear();
  
        await clearRoom(roomId);
        io.to(roomId).emit("board-clear");
        await emitBoardState(io, roomId);
  
        console.log(`[room:${roomId}] board cleared by ${myName}`);
      });
  
      socket.on("undo-board", async () => {
        if (!roomId) return;
  
        await undoStroke(roomId);
        await emitBoardState(io, roomId);
      });
  
      socket.on("redo-board", async () => {
        if (!roomId) return;
  
        await redoStroke(roomId);
        await emitBoardState(io, roomId);
      });
  
      socket.on("cursor-move", ({ x, y }) => {
        if (!roomId) return;
        socket.to(roomId).emit("cursor-move", { id: socket.id, x, y });
      });
  
      socket.on("cursor-leave", () => {
        if (!roomId) return;
        socket.to(roomId).emit("cursor-leave", { id: socket.id });
      });
  
      socket.on("disconnect", () => {
        if (!roomId) return;
  
        const room = runtimeRooms.get(roomId);
        if (room) {
          room.users.delete(socket.id);
  
          for (const [strokeId, stroke] of room.activeStrokes.entries()) {
            if (stroke.userId === socket.id) {
              room.activeStrokes.delete(strokeId);
            }
          }
  
          if (room.users.size === 0) {
            setTimeout(() => {
              const current = runtimeRooms.get(roomId);
              if (current && current.users.size === 0) {
                runtimeRooms.delete(roomId);
              }
            }, 5 * 60 * 1000);
          }
  
          socket.to(roomId).emit("user-left", { id: socket.id });
          console.log(`[room:${roomId}] ${myName} left`);
        }
      });
    });
  }
  
  module.exports = {
    registerBoardSockets,
  };