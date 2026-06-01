const fs = require("fs/promises");
const path = require("path");

const DATA_PATH = path.join(__dirname, "../data/rooms.json");

async function loadRooms() {
  try {
    const data = await fs.readFile(DATA_PATH, "utf-8");

    if (!data.trim()) {
      return {};
    }

    return JSON.parse(data);
  } catch (error) {
    console.error("Failed loading rooms:", error);
    return {};
  }
}

async function saveRooms(rooms) {
  await fs.writeFile(
    DATA_PATH,
    JSON.stringify(rooms, null, 2),
    "utf-8"
  );
}

async function getRoomState(roomId) {
  const rooms = await loadRooms();

  return (
    rooms[roomId] || {
      strokes: [],
      undoneStrokes: [],
      users: [],
      updatedAt: Date.now(),
    }
  );
}

async function saveRoomState(roomId, state) {
  const rooms = await loadRooms();

  rooms[roomId] = {
    ...state,
    updatedAt: Date.now(),
  };

  await saveRooms(rooms);

  return rooms[roomId];
}

async function appendStroke(roomId, stroke) {
  const room = await getRoomState(roomId);

  room.strokes.push(stroke);
  room.updatedAt = Date.now();

  await saveRoomState(roomId, room);

  return room;
}

async function clearRoom(roomId) {
  const room = await getRoomState(roomId);

  room.strokes = [];
  room.undoneStrokes = [];
  room.updatedAt = Date.now();

  await saveRoomState(roomId, room);

  return room;
}

module.exports = {
  getRoomState,
  saveRoomState,
  appendStroke,
  clearRoom,
};