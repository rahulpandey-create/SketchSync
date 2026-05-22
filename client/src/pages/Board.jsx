import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CanvasBoard from "../components/Canvas/CanvasBoard";
import Toolbar from "../components/toolbar/Toolbar";

const STORAGE_KEYS = {
  room: "sketchsync_room",
  name: "sketchsync_name",
};

function getInitialRoom(searchParams) {
  const queryRoom = searchParams.get("room");
  if (queryRoom) return queryRoom;
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEYS.room) || "";
}

function getInitialName() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEYS.name) || "";
}

export default function Board() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [roomInput, setRoomInput] = useState(() => getInitialRoom(searchParams));
  const [nameInput, setNameInput] = useState(() => getInitialName());

  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [joined, setJoined] = useState(false);

  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#111827");
  const [size, setSize] = useState(4);
  const [users, setUsers] = useState([]);
  const [socketReady, setSocketReady] = useState(false);

  const roomDisplay = useMemo(() => roomId || roomInput || "", [roomId, roomInput]);

  useEffect(() => {
    const queryRoom = searchParams.get("room");
    if (queryRoom) {
      setRoomInput(queryRoom);
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (roomId) window.localStorage.setItem(STORAGE_KEYS.room, roomId);
    if (userName) window.localStorage.setItem(STORAGE_KEYS.name, userName);
  }, [roomId, userName]);

  const handleJoin = (event) => {
    event.preventDefault();

    const cleanedRoom = String(roomInput || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");

    const cleanedName = String(nameInput || "").trim();

    if (!cleanedRoom || !cleanedName) return;

    setRoomId(cleanedRoom);
    setUserName(cleanedName);
    setJoined(true);
    setSearchParams({ room: cleanedRoom });

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEYS.room, cleanedRoom);
      window.localStorage.setItem(STORAGE_KEYS.name, cleanedName);
    }
  };

  const handleRejoin = () => {
    setJoined(false);
  };

  const handleUsersChange = (nextUsers) => {
    setUsers(nextUsers);
  };

  const handleInit = (payload) => {
    if (payload?.you?.name) {
      setUserName(payload.you.name);
    }
  };

  const boardUrl = useMemo(() => {
    if (typeof window === "undefined" || !roomDisplay) return "";
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomDisplay);
    return url.toString();
  }, [roomDisplay]);

  const copyRoomLink = async () => {
    if (!boardUrl || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(boardUrl);
    } catch (error) {
      console.error("Failed to copy room link:", error);
    }
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <div>
            <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">
              ← Back home
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Join a SketchSync board</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
              Create or enter a room, then start drawing in real time.
            </p>
          </div>

          <form onSubmit={handleJoin} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="grid gap-5">
              <div>
                <label htmlFor="room" className="mb-2 block text-sm font-medium text-slate-700">
                  Room code
                </label>
                <input
                  id="room"
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  placeholder="design-room-01"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-0 transition placeholder:text-slate-400 focus:border-slate-400"
                />
              </div>

              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700">
                  Your name
                </label>
                <input
                  id="name"
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Rahul"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-0 transition placeholder:text-slate-400 focus:border-slate-400"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Enter board
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const generatedRoom = `room-${Math.random().toString(36).slice(2, 8)}`;
                    setRoomInput(generatedRoom);
                  }}
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  Generate room code
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-4 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-400 flex-col gap-4">
        <header className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">SketchSync</p>
            <h2 className="mt-1 text-lg font-semibold sm:text-xl">Room: {roomId}</h2>
            <p className="text-sm text-slate-600">
              {users.length} participant{users.length === 1 ? "" : "s"} online
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyRoomLink}
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
            >
              Copy room link
            </button>
            <button
              type="button"
              onClick={handleRejoin}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Change room
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
          onClear={() => {
            // CanvasBoard handles the actual socket clear when its button is used.
            // This keeps toolbar pure and reusable.
          }}
          disabled={!socketReady}
        />

        <main className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <CanvasBoard
            roomId={roomId}
            userName={userName}
            tool={tool}
            color={color}
            size={size}
            onUsersChange={handleUsersChange}
            onInit={handleInit}
            onConnectionChange={setSocketReady}
          />
        </main>
      </div>
    </div>
  );
}
