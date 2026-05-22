import { io } from "socket.io-client";

/**
 * Prefer Vite env first, then CRA env, then localhost fallback.
 * Set one of these in your client env file:
 * - VITE_SOCKET_URL=http://localhost:3001
 * - REACT_APP_SOCKET_URL=http://localhost:3001
 */
const SOCKET_URL =
  import.meta.env?.VITE_SOCKET_URL ||
  import.meta.env?.REACT_APP_SOCKET_URL ||
  "http://localhost:3001";

export const SOCKET_EVENTS = Object.freeze({
  CONNECT: "connect",
  DISCONNECT: "disconnect",
  CONNECT_ERROR: "connect_error",

  JOIN_ROOM: "join-room",
  INIT: "init",
  USER_JOINED: "user-joined",
  USER_LEFT: "user-left",

  STROKE_BEGIN: "stroke-begin",
  STROKE_POINT: "stroke-point",
  STROKE_END: "stroke-end",

  BOARD_CLEAR: "board-clear",

  CURSOR_MOVE: "cursor-move",
  CURSOR_LEAVE: "cursor-leave",
});

const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
  withCredentials: true,
  timeout: 10000,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
});

/** Prevent duplicate connect() calls. */
let connectPromise = null;

/** Normalize room names before sending them to the server. */
export function normalizeRoomCode(room) {
  return String(room || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

/** Connect once and reuse the same socket instance. */
export async function connectSocket() {
  if (socket.connected) return socket;
  if (connectPromise) return connectPromise;

  connectPromise = new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off(SOCKET_EVENTS.CONNECT, onConnect);
      socket.off(SOCKET_EVENTS.CONNECT_ERROR, onError);
      connectPromise = null;
    };

    const onConnect = () => {
      cleanup();
      resolve(socket);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    socket.once(SOCKET_EVENTS.CONNECT, onConnect);
    socket.once(SOCKET_EVENTS.CONNECT_ERROR, onError);
    socket.connect();
  });

  return connectPromise;
}

/** Hard disconnect the socket. */
export function disconnectSocket() {
  if (socket.connected || socket.active) {
    socket.disconnect();
  }
}

/** Join a board room. Backend expects: { room, name } */
export async function joinRoom({ room, name }) {
  await connectSocket();
  socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
    room: normalizeRoomCode(room),
    name: String(name || "").trim(),
  });
}

/** Drawing events */
export async function emitStrokeBegin(payload) {
  await connectSocket();
  socket.emit(SOCKET_EVENTS.STROKE_BEGIN, payload);
}

export async function emitStrokePoint(payload) {
  await connectSocket();
  socket.emit(SOCKET_EVENTS.STROKE_POINT, payload);
}

export async function emitStrokeEnd(payload) {
  await connectSocket();
  socket.emit(SOCKET_EVENTS.STROKE_END, payload);
}

export async function clearBoard() {
  await connectSocket();
  socket.emit(SOCKET_EVENTS.BOARD_CLEAR);
}

/** Cursor events */
export async function moveCursor(payload) {
  await connectSocket();
  socket.emit(SOCKET_EVENTS.CURSOR_MOVE, payload);
}

export async function leaveCursor() {
  await connectSocket();
  socket.emit(SOCKET_EVENTS.CURSOR_LEAVE);
}

/**
 * Generic subscription helper.
 * Returns an unsubscribe function so React components can clean up safely.
 */
export function on(event, handler) {
  socket.on(event, handler);
  return () => socket.off(event, handler);
}

/** Safer alias for one-time listeners. */
export function once(event, handler) {
  socket.once(event, handler);
}

/** Optional: remove every listener when leaving the board/page. */
export function removeAllSocketListeners() {
  socket.removeAllListeners();
}

export default socket;