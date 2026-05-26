import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
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
 * Responsibilities:
 * - Connect to the socket server
 * - Join a room
 * - Draw locally on mouse/touch/pen input
 * - Broadcast stroke events
 * - Rebuild remote strokes from socket events
 * - Show basic loading / connection state
 *
 * Expected backend events (already implemented in server):
 * init, user-joined, user-left, stroke-begin, stroke-point, stroke-end,
 * board-clear, cursor-move, cursor-leave.
 */
const CanvasBoard = forwardRef(function CanvasBoard(
  {
    roomId,
    userName,
    tool = "pen",
    color = "#111827",
    size = 4,
    className = "",
    onUsersChange,
    onInit,
    onConnectionChange,
  },
  ref
) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const currentStrokeRef = useRef(null);
  const remoteStrokesRef = useRef(new Map());
  const localStrokesRef = useRef([]);
  const animationFrameRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);

  const [status, setStatus] = useState("idle");
  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState([]);

  const normalizedRoomId = useMemo(() => {
    return String(roomId || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");
  }, [roomId]);

  const getCanvas = () => canvasRef.current;

  const getContext = useCallback(() => {
    const canvas = getCanvas();
    return canvas ? canvas.getContext("2d") : null;
  }, []);

  const getCanvasMetrics = useCallback(() => {
    const canvas = getCanvas();
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;

    return { canvas, rect, width, height, dpr };
  }, []);

  const drawStroke = useCallback(
    (stroke) => {
      const ctx = getContext();
      const metrics = getCanvasMetrics();
      if (!ctx || !metrics || !stroke?.points?.length) return;

      const { width, height } = metrics;
      const points = stroke.points
        .map((p) => ({
          x: Math.max(0, Math.min(1, p.xNorm)) * width,
          y: Math.max(0, Math.min(1, p.yNorm)) * height,
        }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

      if (!points.length) return;

      const strokeColor = stroke.tool === "eraser" ? "#ffffff" : stroke.color || color;
      const strokeSize = stroke.size || size;

      ctx.save();
      ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = strokeColor;
      ctx.lineWidth = strokeSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (points.length === 1) {
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, Math.max(1, strokeSize / 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    },
    [color, getCanvasMetrics, getContext, size]
  );

  const redrawAll = useCallback(() => {
    const ctx = getContext();
    const metrics = getCanvasMetrics();
    if (!ctx || !metrics) return;

    const { width, height, dpr } = metrics;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (currentStrokeRef.current) drawStroke(currentStrokeRef.current);
    for (const stroke of localStrokesRef.current) drawStroke(stroke);
    for (const stroke of remoteStrokesRef.current.values()) drawStroke(stroke);
  }, [drawStroke, getCanvasMetrics, getContext]);

  const scheduleRedraw = useCallback(() => {
    if (animationFrameRef.current) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      redrawAll();
    });
  }, [redrawAll]);

  const clearLocalAndRemote = useCallback(() => {
    localStrokesRef.current = [];
    remoteStrokesRef.current.clear();
    currentStrokeRef.current = null;
    isDrawingRef.current = false;
    lastPointRef.current = null;

    const ctx = getContext();
    const metrics = getCanvasMetrics();
    if (ctx && metrics) {
      ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
      ctx.clearRect(0, 0, metrics.width, metrics.height);
    }
  }, [getCanvasMetrics, getContext]);

  const handleClear = useCallback(async () => {
    clearLocalAndRemote();
    await clearBoard();
    scheduleRedraw();
  }, [clearLocalAndRemote, scheduleRedraw]);

  useImperativeHandle(
    ref,
    () => ({
      clearBoard: handleClear,
      redraw: scheduleRedraw,
    }),
    [handleClear, scheduleRedraw]
  );

  const resizeCanvas = useCallback(() => {
    const canvas = getCanvas();
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    redrawAll();
  }, [redrawAll]);

  const toPoint = useCallback((event) => {
    const canvas = getCanvas();
    if (!canvas) return { x: 0, y: 0, xNorm: 0, yNorm: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
    const clientY = event.clientY ?? event.touches?.[0]?.clientY ?? 0;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    return {
      x,
      y,
      xNorm: rect.width ? x / rect.width : 0,
      yNorm: rect.height ? y / rect.height : 0,
    };
  }, []);

  const startStroke = useCallback(
    async (event) => {
      if (!normalizedRoomId) return;
      if (event.button !== undefined && event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget?.setPointerCapture?.(event.pointerId);

      const point = toPoint(event);
      isDrawingRef.current = true;
      lastPointRef.current = { x: point.x, y: point.y };

      const strokeId = crypto.randomUUID();
      currentStrokeRef.current = {
        id: strokeId,
        tool,
        color,
        size,
        points: [{ xNorm: point.xNorm, yNorm: point.yNorm }],
      };

      scheduleRedraw();

      await emitStrokeBegin({
        strokeId,
        tool,
        color,
        size,
        x: point.xNorm,
        y: point.yNorm,
      });
    },
    [color, normalizedRoomId, scheduleRedraw, size, tool, toPoint]
  );

  const continueStroke = useCallback(
    async (event) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;

      event.preventDefault();
      event.stopPropagation();

      const point = toPoint(event);
      const prev = lastPointRef.current;
      if (!prev) {
        lastPointRef.current = { x: point.x, y: point.y };
        return;
      }

      currentStrokeRef.current.points.push({ xNorm: point.xNorm, yNorm: point.yNorm });
      lastPointRef.current = { x: point.x, y: point.y };
      scheduleRedraw();

      await emitStrokePoint({
        strokeId: currentStrokeRef.current.id,
        x: point.xNorm,
        y: point.yNorm,
      });

      await moveCursor({ x: point.xNorm, y: point.yNorm });
    },
    [scheduleRedraw, toPoint]
  );

  const endStroke = useCallback(
    async (event) => {
      if (!isDrawingRef.current || !currentStrokeRef.current) return;

      event?.preventDefault?.();
      event?.stopPropagation?.();

      const finishedStroke = currentStrokeRef.current;
      currentStrokeRef.current = null;
      isDrawingRef.current = false;
      lastPointRef.current = null;

      if (finishedStroke?.points?.length) {
        localStrokesRef.current.push(finishedStroke);
      }

      scheduleRedraw();

      await emitStrokeEnd({ strokeId: finishedStroke.id });
      await leaveCursor();
    },
    [scheduleRedraw]
  );

  useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resizeCanvas]);

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
  }, [endStroke, normalizedRoomId, userName]);

  useEffect(() => {
    const stopConnect = on(SOCKET_EVENTS.CONNECT, () => {
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
      localStrokesRef.current = [];
      setUsers(Array.isArray(payload?.users) ? payload.users : []);
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
      remoteStrokesRef.current.set(strokeId, {
        id: strokeId,
        tool: incomingTool,
        color: incomingColor,
        size: incomingSize,
        points: [{ xNorm: x, yNorm: y }],
      });
      scheduleRedraw();
    });

    const stopStrokePoint = on(SOCKET_EVENTS.STROKE_POINT, ({ strokeId, x, y }) => {
      const stroke = remoteStrokesRef.current.get(strokeId);
      if (!stroke) return;
      stroke.points = stroke.points || [];
      stroke.points.push({ xNorm: x, yNorm: y });
      remoteStrokesRef.current.set(strokeId, stroke);
      scheduleRedraw();
    });

    const stopStrokeEnd = on(SOCKET_EVENTS.STROKE_END, () => {
      scheduleRedraw();
    });

    const stopBoardClear = on(SOCKET_EVENTS.BOARD_CLEAR, () => {
      clearLocalAndRemote();
      scheduleRedraw();
    });

    const stopCursorMove = on(SOCKET_EVENTS.CURSOR_MOVE, () => {});
    const stopCursorLeave = on(SOCKET_EVENTS.CURSOR_LEAVE, () => {});

    return () => {
      stopConnect();
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
  }, [clearLocalAndRemote, onConnectionChange, onInit, onUsersChange, scheduleRedraw]);

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
          <div className="rounded-2xl bg-white px-4 py-3 text-sm shadow-md">{statusLabel}</div>
        </div>
      )}
    </div>
  );
});

export default CanvasBoard;
