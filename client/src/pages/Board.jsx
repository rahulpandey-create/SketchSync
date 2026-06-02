import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CanvasBoard from "../components/Canvas/CanvasBoard";
import Toolbar from "../components/Toolbar/Toolbar";
import { redoBoard, undoBoard } from "../services/socket";

const STORAGE_KEYS = {
  room: "sketchsync_room",
  name: "sketchsync_name",
};

export default function Board() {
  const canvasBoardRef = useRef(null);

  const [searchParams, setSearchParams] = useSearchParams();

  const [roomInput, setRoomInput] = useState("");
  const [nameInput, setNameInput] = useState("");

  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");

  const [joined, setJoined] = useState(false);

  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#111827");
  const [size, setSize] = useState(4);

  const [users, setUsers] = useState([]);

  const [socketReady, setSocketReady] = useState(false);
  const [roomReady, setRoomReady] = useState(false);

  useEffect(() => {
    const savedRoom =
      searchParams.get("room") ||
      localStorage.getItem(STORAGE_KEYS.room);

    const savedName =
      localStorage.getItem(STORAGE_KEYS.name);

    if (!joined && savedRoom && savedName) {
      setRoomId(savedRoom);
      setUserName(savedName);

      setRoomInput(savedRoom);
      setNameInput(savedName);

      setJoined(true);
    }
  }, [joined, searchParams]);

  useEffect(() => {
    if (roomId) {
      localStorage.setItem(STORAGE_KEYS.room, roomId);
    }

    if (userName) {
      localStorage.setItem(STORAGE_KEYS.name, userName);
    }
  }, [roomId, userName]);

  const handleJoin = (e) => {
    e.preventDefault();

    const cleanedRoom = roomInput
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");

    const cleanedName = nameInput.trim();

    if (!cleanedRoom || !cleanedName) {
      return;
    }

    setRoomId(cleanedRoom);
    setUserName(cleanedName);

    setJoined(true);

    setSearchParams({
      room: cleanedRoom,
    });
  };

  const handleChangeRoom = () => {
    setJoined(false);

    setSocketReady(false);
    setRoomReady(false);

    setUsers([]);

    setRoomId("");
    setRoomInput("");

    setSearchParams({});

    localStorage.removeItem(STORAGE_KEYS.room);

    canvasBoardRef.current = null;
  };

  const handleClear = () => {
    canvasBoardRef.current?.clearBoard?.();
  };

  const handleUndo = async () => {
    await undoBoard();
  };

  const handleRedo = async () => {
    await redoBoard();
  };

  const roomLink = useMemo(() => {
    if (!roomId) return "";

    return `${window.location.origin}/board?room=${roomId}`;
  }, [roomId]);

  if (!joined) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">

        <form
          onSubmit={handleJoin}
          className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
        >

          <Link
            to="/"
            className="text-sm text-slate-500"
          >
            ← Back
          </Link>

          <h1 className="mt-4 text-3xl font-bold">
            Join SketchSync
          </h1>

          <div className="mt-6 space-y-4">

            <input
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="Room ID"
              className="w-full rounded-xl border p-3"
            />

            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Name"
              className="w-full rounded-xl border p-3"
            />

            <button
              className="w-full rounded-xl bg-black py-3 text-white"
            >
              Enter board
            </button>

          </div>
        </form>

      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">

      <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-[1600px] flex-col gap-4">

        <header className="rounded-3xl border bg-white p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">

          <div>
            <h2 className="font-bold text-xl">
              Room: {roomId}
            </h2>

            <p className="text-sm text-slate-500">
              {users.length} participant(s)
            </p>
          </div>

          <div className="flex gap-2">

            <button
              onClick={() => navigator.clipboard.writeText(roomLink)}
              className="rounded-xl bg-slate-100 px-4 py-2"
            >
              Copy Link
            </button>

            <button
              onClick={handleChangeRoom}
              className="rounded-xl bg-black px-4 py-2 text-white"
            >
              Change Room
            </button>

          </div>

        </header>

        <Toolbar
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          size={size}
          setSize={setSize}
          onClear={handleClear}
          onUndo={handleUndo}
          onRedo={handleRedo}
          disabled={!socketReady || !roomReady}
        />

        <main className="flex-1 overflow-hidden rounded-3xl border bg-white">

          <CanvasBoard
            ref={canvasBoardRef}
            roomId={roomId}
            userName={userName}
            tool={tool}
            color={color}
            size={size}
            onUsersChange={setUsers}
            onConnectionChange={setSocketReady}
            onRoomReadyChange={setRoomReady}
          />

        </main>

      </div>

    </div>
  );
}