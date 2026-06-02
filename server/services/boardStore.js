const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const DATA_FILE = path.join(DATA_DIR, "rooms.json");

function createDefaultRoomState() {
  return {
    strokes: [],
    redoStrokes: [],
    updatedAt: Date.now(),
  };
}

function normalizeRoomState(state) {
  return {
    strokes: Array.isArray(state?.strokes) ? state.strokes : [],
    redoStrokes: Array.isArray(state?.redoStrokes) ? state.redoStrokes : [],
    updatedAt: Number.isFinite(state?.updatedAt) ? state.updatedAt : Date.now(),
  };
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "{}", "utf-8");
  }
}

async function readAllRooms() {
  await ensureDataFile();

  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (error) {
    console.error("Failed to read rooms.json:", error);
    return {};
  }
}

async function writeAllRooms(rooms) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(rooms, null, 2), "utf-8");
}

async function getRoomState(roomId) {
  const rooms = await readAllRooms();
  return normalizeRoomState(rooms[roomId] || createDefaultRoomState());
}

async function saveRoomState(roomId, state) {
  const rooms = await readAllRooms();

  rooms[roomId] = normalizeRoomState({
    ...state,
    updatedAt: Date.now(),
  });

  await writeAllRooms(rooms);
  return rooms[roomId];
}

async function appendStroke(roomId, stroke) {
  console.log("appendStroke called", roomId);

  const room = await getRoomState(roomId);

  room.strokes.push(stroke);
  room.redoStrokes = [];
  room.updatedAt = Date.now();

  await saveRoomState(roomId, room);
  return room;
}

async function clearRoom(roomId) {
  const room = await getRoomState(roomId);

  room.strokes = [];
  room.redoStrokes = [];
  room.updatedAt = Date.now();

  await saveRoomState(roomId, room);
  return room;
}

async function undoStroke(roomId) {
  const room = await getRoomState(roomId);

  if (room.strokes.length === 0) {
    return room;
  }

  const stroke = room.strokes.pop();
  room.redoStrokes.push(stroke);
  room.updatedAt = Date.now();

  await saveRoomState(roomId, room);
  return room;
}

async function redoStroke(roomId) {
  const room = await getRoomState(roomId);

  if (room.redoStrokes.length === 0) {
    return room;
  }

  const stroke = room.redoStrokes.pop();
  room.strokes.push(stroke);
  room.updatedAt = Date.now();

  await saveRoomState(roomId, room);
  return room;
}

module.exports = {
  getRoomState,
  saveRoomState,
  appendStroke,
  clearRoom,
  undoStroke,
  redoStroke,
};