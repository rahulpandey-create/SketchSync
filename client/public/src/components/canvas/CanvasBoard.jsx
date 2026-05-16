import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import socket, {
  SOCKET_EVENTS,
  clearBoard,
  connectSocket,
  emitStrokeBegin,
  emitStrokeEnd,
  emitStrokePoint,
  joinRoom,
  leaveCursor,
  moveCursor,
  on,
  removeAllSocketListeners,
} from "../../services/socket";

/**
 * CanvasBoard
 * Production-oriented collaborative whiteboard canvas.
 *
 * Responsibilities:
 * - Connect to the socket server
 * - Join a room
 * - Draw locally on mouse/touch/pen input
 * - Broadcast stroke events
 * - Rebuild remote strokes from socket events
 * - Show basic loading / connection state
 *
 * Expected backend events (already implemented in your server):
 * init, user-joined, user-left, stroke-begin, stroke-point, stroke-end,
 * board-clear, cursor-move, cursor-leave.
 */
export default function CanvasBoard({
  roomId,
  userName,
  tool = "pen",
  color = "#111827",
  size = 4,
  className = "",
  onUsersChange,
  onInit,
  onConnectionChange,
}) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const strokeIdRef = useRef(null);
  const strokePointsRef = useRef([]);
  const remoteStrokesRef = useRef(new Map());
  const activeRemoteStrokeRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState([]);
  const [you, setYou] = useState(null);

  const normalizedRoomId = useMemo(() => {
    return String(roomId || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
  }, [roomId]);

  const getCanvas = () => canvasRef.current;
  const getContext = () => getCanvas()?.getContext("2d");

  const resizeCanvas = useCallback(() => {
    const canvas = getCanvas();
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Preserve existing image while resizing.
    const existingImage = document.createElement("canvas");
    existingImage.width = canvas.width;
    existingImage.height = canvas.height;
    const existingCtx = existingImage.getContext("2d");
    if (existingCtx) {
      existingCtx.drawImage(canvas, 0, 0);
    }

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = getContext();
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = size;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      // Restore previous drawing scaled to the new size.
      const oldCtx = existingImage.getContext("2d");
      if (oldCtx) {
        ctx.drawImage(existingImage, 0, 0, existingImage.width / dpr, existingImage.height / dpr, 0, 0, rect.width, rect.height);
      }
    }
  }, [color, size]);

  const getPointerPosition = useCallback((event) => {
    const canvas = getCanvas();
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = event.clientX ?? (event.touches?.[0]?.clientX ?? 0);
    const clientY = event.clientY ?? (event.touches?.[0]?.clientY ?? 0);

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      xNorm: rect.width ? (clientX - rect.left) / rect.width : 0,
      yNorm: rect.height ? (clientY - rect.top) / rect.height : 0,
    };
  }, []);

  const drawSegment = useCallback((from, to, opts = {}) => {
    const ctx = getContext();
    const canvas = getCanvas();
    if (!ctx || !canvas) return;

    const strokeColor = opts.tool === "eraser" ? "#ffffff" : opts.color || color;
    const strokeSize = opts.size || size;

    ctx.save();
    ctx.globalCompositeOperation = opts.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = strokeSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  }, [color, size]);

  const drawDot = useCallback((point, opts = {}) => {
    const ctx = getContext();
    if (!ctx) return;

    const strokeColor = opts.tool === "eraser" ? "#ffffff" : opts.color || color;
    const strokeSize = opts.size || size;

    ctx.save();
    ctx.globalCompositeOperation = opts.tool === "eraser" ? "destination-out" : "source-over";
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(1, strokeSize / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, [color, size]);

  const redrawAll = useCallback(() => {
    const canvas = getCanvas();
    const ctx = getContext();
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    for (const stroke of remoteStrokesRef.current.values()) {
      const points = stroke.points || [];
      if (!points.length) continue;
      if (points.length === 1) {
        drawDot(points[0], stroke);
        continue;
      }
      for (let i = 1; i < points.length; i += 1) {
        drawSegment(points[i - 1], points[i], stroke);
      }
    }
  }, [drawDot, drawSegment]);

  const scheduleRedraw = useCallback(() => {
    if (animationFrameRef.current) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      redrawAll();
    });
  }, [redrawAll]);

  const upsertRemoteStroke = useCallback((strokeId, patch) => {
    const map = remoteStrokesRef.current;
    const existing = map.get(strokeId) || {
      id: strokeId,
      points: [],
      tool: patch.tool || "pen",
      color: patch.color || "#111827",
      size: patch.size || 4,
      userId: patch.userId,
    };

    const next = {
      ...existing,
      ...patch,
      points: patch.points ? patch.points : existing.points,
    };

    map.set(strokeId, next);
    return next;
  }, []);

  const startStroke = useCallback(async (event) => {
    if (!normalizedRoomId) return;
    if (event.button !== undefined && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const point = getPointerPosition(event);
    isDrawingRef.current = true;
    lastPointRef.current = { x: point.x, y: point.y };
    strokePointsRef.current = [{ x: point.x, y: point.y }];
    strokeIdRef.current = crypto.randomUUID();

    const payload = {
      strokeId: strokeIdRef.current,
      tool,
      color,
      size,
      x: point.xNorm,
      y: point.yNorm,
    };

    drawDot(point, { tool, color, size });
    await emitStrokeBegin(payload);
  }, [color, getPointerPosition, normalizedRoomId, size, tool, drawDot]);

  const continueStroke = useCallback(async (event) => {
    if (!isDrawingRef.current || !strokeIdRef.current) return;

    event.preventDefault();
    event.stopPropagation();

    const point = getPointerPosition(event);
    const prev = lastPointRef.current;
    if (!prev) {
      lastPointRef.current = { x: point.x, y: point.y };
      return;
    }

    drawSegment(prev, { x: point.x, y: point.y }, { tool, color, size });
    lastPointRef.current = { x: point.x, y: point.y };
    strokePointsRef.current.push({ x: point.x, y: point.y });

    await emitStrokePoint({
      strokeId: strokeIdRef.current,
      x: point.xNorm,
      y: point.yNorm,
    });

    await moveCursor({ x: point.xNorm, y: point.yNorm });
  }, [color, drawSegment, getPointerPosition, size, tool]);

  const endStroke = useCallback(async (event) => {
    if (!isDrawingRef.current || !strokeIdRef.current) return;

    event?.preventDefault?.();
    event?.stopPropagation?.();

    const id = strokeIdRef.current;
    isDrawingRef.current = false;
    strokeIdRef.current = null;
    lastPointRef.current = null;

    await emitStrokeEnd({ strokeId: id });
    await leaveCursor();
  }, []);

  const handleClear = useCallback(async () => {
    remoteStrokesRef.current.clear();
    redrawAll();
    await clearBoard();
  }, [redrawAll]);

  useEffect(() => {
    resizeCanvas();

    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resizeCanvas]);

  useEffect(() => {
    const canvas = getCanvas();
    if (!canvas) return undefined;

    const stop = on(SOCKET_EVENTS.CONNECT, () => {
      setConnected(true);
      setStatus("connected");
      onConnectionChange?.(true);
    });

    const stopDisconnect = on(SOCKET_EVENTS.DISCONNECT, () => {
      setConnected(false);
      setStatus("disconnected");
      onConnectionChange?.(false);
    });

    const stopError = on(SOCKET_EVENTS.CONNECT_ERROR, () => {
      setConnected(false);
      setStatus("error");
      onConnectionChange?.(false);
    });

    const stopInit = on(SOCKET_EVENTS.INIT, (payload) => {
      const strokes = Array.isArray(payload?.strokes) ? payload.strokes : [];
      const nextMap = new Map();
      strokes.forEach((stroke) => {
        if (stroke?.id) nextMap.set(stroke.id, stroke);
      });
      remoteStrokesRef.current = nextMap;
      setUsers(Array.isArray(payload?.users) ? payload.users : []);
      setYou(payload?.you || null);
      onUsersChange?.(Array.isArray(payload?.users) ? payload.users : []);
      onInit?.(payload);
      setStatus("ready");
      scheduleRedraw();
    });

    const stopJoin = on(SOCKET_EVENTS.USER_JOINED, (user) => {
      setUsers((prev) => {
        const next = [...prev.filter((u) => u.id !== user.id), user];
        onUsersChange?.(next);
        return next;
      });
    });

    const stopLeft = on(SOCKET_EVENTS.USER_LEFT, ({ id }) => {
      setUsers((prev) => {
        const next = prev.filter((u) => u.id !== id);
        onUsersChange?.(next);
        return next;
      });
    });

    const stopStrokeBegin = on(SOCKET_EVENTS.STROKE_BEGIN, ({ strokeId, tool: incomingTool, color: incomingColor, size: incomingSize, x, y }) => {
      if (!strokeId) return;

      const canvasEl = getCanvas();
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const startPoint = { x: x * rect.width, y: y * rect.height };

      upsertRemoteStroke(strokeId, {
        tool: incomingTool,
        color: incomingColor,
        size: incomingSize,
        points: [startPoint],
      });

      activeRemoteStrokeRef.current = strokeId;
      scheduleRedraw();
    });

    const stopStrokePoint = on(SOCKET_EVENTS.STROKE_POINT, ({ strokeId, x, y }) => {
      if (!strokeId) return;
      const canvasEl = getCanvas();
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      const point = { x: x * rect.width, y: y * rect.height };
      const stroke = remoteStrokesRef.current.get(strokeId);
      if (!stroke) return;
      stroke.points = stroke.points || [];
      stroke.points.push(point);
      remoteStrokesRef.current.set(strokeId, stroke);
      scheduleRedraw();
    });

    const stopStrokeEnd = on(SOCKET_EVENTS.STROKE_END, ({ strokeId }) => {
      if (!strokeId) return;
      activeRemoteStrokeRef.current = null;
      scheduleRedraw();
    });

    const stopBoardClear = on(SOCKET_EVENTS.BOARD_CLEAR, () => {
      remoteStrokesRef.current.clear();
      scheduleRedraw();
    });

    const stopCursorMove = on(SOCKET_EVENTS.CURSOR_MOVE, () => {
      // Hook ready for a future cursor layer.
    });

    const stopCursorLeave = on(SOCKET_EVENTS.CURSOR_LEAVE, () => {
      // Hook ready for a future cursor layer.
    });

    return () => {
      stop();
      stopDisconnect();
      stopError();
      stopInit();
      stopJoin();
      stopLeft();
      stopStrokeBegin();
      stopStrokePoint();
      stopStrokeEnd();
      stopBoardClear();
      stopCursorMove();
      stopCursorLeave();
      removeAllSocketListeners();
    };
  }, [onConnectionChange, onInit, onUsersChange, scheduleRedraw, upsertRemoteStroke]);

  useEffect(() => {
    if (!normalizedRoomId) return undefined;

    let mounted = true;
    setStatus("connecting");

    (async () => {
      try {
        await connectSocket();
        if (!mounted) return;
        await joinRoom({ room: normalizedRoomId, name: userName });
        setConnected(true);
      } catch (error) {
        console.error("Socket connection failed:", error);
        if (mounted) {
          setStatus("error");
          setConnected(false);
        }
      }
    })();

    return () => {
      mounted = false;
      endStroke();
      leaveCursor();
    };
  }, [endStroke, joinRoom, leaveCursor, normalizedRoomId, userName]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const statusLabel = useMemo(() => {
    if (status === "connecting") return "Connecting...";
    if (status === "connected") return "Connected";
    if (status === "ready") return "Ready";
    if (status === "disconnected") return "Disconnected";
    if (status === "error") return "Connection error";
    return "Idle";
  }, [status]);

  return (
    <div ref={wrapperRef} className={`relative h-full w-full overflow-hidden rounded-2xl bg-white shadow-sm ${className}`}>
      <div className="absolute left-4 top-4 z-10 rounded-full bg-black/80 px-3 py-1 text-xs font-medium text-white">
        {statusLabel} · {users.length} user{users.length === 1 ? "" : "s"}
      </div>

      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none select-none"
        onPointerDown={startStroke}
        onPointerMove={continueStroke}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
        onContextMenu={(e) => e.preventDefault()}
      />

      <button
        type="button"
        onClick={handleClear}
        className="absolute bottom-4 right-4 z-10 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/90"
      >
        Clear board
      </button>

      {!connected && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/40">
          <div className="rounded-2xl bg-white px-4 py-3 text-sm shadow-md">
            {statusLabel}
          </div>
        </div>
      )}
    </div>
  );
}
