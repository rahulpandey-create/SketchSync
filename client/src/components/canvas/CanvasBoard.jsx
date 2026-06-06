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

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function pointToCanvasPoint(rawPoint, width, height) {
  if (!rawPoint) return null;

  if (Number.isFinite(rawPoint.xNorm) && Number.isFinite(rawPoint.yNorm)) {
    return {
      x: clamp01(rawPoint.xNorm) * width,
      y: clamp01(rawPoint.yNorm) * height,
    };
  }

  if (Number.isFinite(rawPoint.x) && Number.isFinite(rawPoint.y)) {
    const x =
      rawPoint.x <= 1 && rawPoint.x >= 0 ? rawPoint.x * width : rawPoint.x;
    const y =
      rawPoint.y <= 1 && rawPoint.y >= 0 ? rawPoint.y * height : rawPoint.y;
    return { x, y };
  }

  return null;
}

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
    onRoomReadyChange,
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
  const [roomReady, setRoomReady] = useState(false);
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
        .map((p) => pointToCanvasPoint(p, width, height))
        .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));

      if (!points.length) return;

      const strokeColor =
        stroke.tool === "eraser" ? "#ffffff" : stroke.color || "#111827";
      const strokeSize = stroke.size || 4;

      ctx.save();
      ctx.globalCompositeOperation =
        stroke.tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = strokeColor;
      ctx.lineWidth = strokeSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (points.length === 1) {
        ctx.beginPath();
        ctx.arc(
          points[0].x,
          points[0].y,
          Math.max(1, strokeSize / 2),
          0,
          Math.PI * 2
        );
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
    [getCanvasMetrics, getContext]
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
    if (!roomReady) return;
    clearLocalAndRemote();
    await clearBoard();
    scheduleRedraw();
  }, [clearLocalAndRemote, roomReady, scheduleRedraw]);

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
      if (!normalizedRoomId || !roomReady) return;
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
    [color, normalizedRoomId, roomReady, scheduleRedraw, size, tool, toPoint]
  );

  const continueStroke = useCallback(
    async (event) => {
      if (!roomReady || !isDrawingRef.current || !currentStrokeRef.current)
        return;

      event.preventDefault();
      event.stopPropagation();

      const point = toPoint(event);
      const prev = lastPointRef.current;
      if (!prev) {
        lastPointRef.current = { x: point.x, y: point.y };
        return;
      }

      currentStrokeRef.current.points.push({
        xNorm: point.xNorm,
        yNorm: point.yNorm,
      });
      lastPointRef.current = { x: point.x, y: point.y };
      scheduleRedraw();

      await emitStrokePoint({
        strokeId: currentStrokeRef.current.id,
        x: point.xNorm,
        y: point.yNorm,
      });

      await moveCursor({ x: point.xNorm, y: point.yNorm });
    },
    [roomReady, scheduleRedraw, toPoint]
  );

  const endStroke = useCallback(
    async (event) => {
      if (!roomReady || !isDrawingRef.current || !currentStrokeRef.current)
        return;

      event?.preventDefault?.();
      event?.stopPropagation?.();
      event.currentTarget?.releasePointerCapture?.(event.pointerId);

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
    [roomReady, scheduleRedraw]
  );

  useEffect(() => {
    resizeCanvas();

    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [resizeCanvas]);

  useEffect(() => {
    console.log("normalizedRoomId value:", normalizedRoomId);
    if (!normalizedRoomId) return undefined;
    console.log("EFFECT START", normalizedRoomId, userName);

    let mounted = true;

    // Register listeners first so INIT cannot be missed.
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
      // console.log("INIT EVENT FIRED");

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

      console.log("setting local room ready");

      setStatus("ready");

      setRoomReady(true);

      console.log("calling parent room ready");

      onRoomReadyChange?.(true);

      console.log("finished INIT block");

      scheduleRedraw();
    });

    const stopBoardState = on(SOCKET_EVENTS.BOARD_STATE, (payload) => {
      const strokes = Array.isArray(payload?.strokes) ? payload.strokes : [];
      const nextMap = new Map();
      strokes.forEach((stroke) => {
        if (stroke?.id) nextMap.set(stroke.id, stroke);
      });

      remoteStrokesRef.current = nextMap;
      localStrokesRef.current = [];
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

    const stopStrokeBegin = on(
      SOCKET_EVENTS.STROKE_BEGIN,
      ({
        strokeId,
        tool: incomingTool,
        color: incomingColor,
        size: incomingSize,
        x,
        y,
      }) => {
        if (!strokeId) return;

        remoteStrokesRef.current.set(strokeId, {
          id: strokeId,
          tool: incomingTool,
          color: incomingColor,
          size: incomingSize,
          points: [{ xNorm: x, yNorm: y }],
        });

        scheduleRedraw();
      }
    );

    const stopStrokePoint = on(
      SOCKET_EVENTS.STROKE_POINT,
      ({ strokeId, x, y }) => {
        const stroke = remoteStrokesRef.current.get(strokeId);
        if (!stroke) return;

        stroke.points = stroke.points || [];
        stroke.points.push({ xNorm: x, yNorm: y });
        remoteStrokesRef.current.set(strokeId, stroke);
        scheduleRedraw();
      }
    );

    const stopStrokeEnd = on(SOCKET_EVENTS.STROKE_END, () => {
      scheduleRedraw();
    });

    const stopBoardClear = on(SOCKET_EVENTS.BOARD_CLEAR, () => {
      clearLocalAndRemote();
      scheduleRedraw();
    });

    const stopCursorMove = on(SOCKET_EVENTS.CURSOR_MOVE, () => {});
    const stopCursorLeave = on(SOCKET_EVENTS.CURSOR_LEAVE, () => {});

    // Then connect + join.
    (async () => {
      try {
        setStatus("connecting");
        setConnected(false);
        setRoomReady(false);
        onRoomReadyChange?.(false);

        console.log("BEFORE CONNECT");
        await connectSocket();
        console.log("AFTER CONNECT");

        if (!mounted) return;

        setConnected(true);
        setStatus("connected");

        onConnectionChange?.(true);
        // console.log("CALLING JOIN ROOM", normalizedRoomId, userName);
        await joinRoom({
          room: normalizedRoomId,
          name: userName,
        });
        console.log("JOIN ROOM FINISHED");
      } catch (error) {
        console.error("Socket connection failed:", error);
        if (mounted) {
          setStatus("error");
          setConnected(false);
          setRoomReady(false);
          onConnectionChange?.(false);
          onRoomReadyChange?.(false);
        }
      }
    })();

    return () => {
      mounted = false;
      // console.log("Canvas cleanup running");
      stopConnect();
      stopDisconnect();
      stopError();
      stopInit();
      stopBoardState();
      stopJoin();
      stopLeft();
      stopStrokeBegin();
      stopStrokePoint();
      stopStrokeEnd();
      stopBoardClear();
      stopCursorMove();
      stopCursorLeave();
      // removeAllSocketListeners();

      endStroke();
      leaveCursor();

      // clearLocalAndRemote();
    };
  }, [normalizedRoomId, userName]);

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
    <div
      ref={wrapperRef}
      className={`relative h-full w-full overflow-hidden rounded-2xl bg-white shadow-sm ${className}`}
    >
      <div className="absolute left-4 top-4 z-10 rounded-full bg-black/80 px-3 py-1 text-xs font-medium text-white">
        {statusLabel} · {users.length} user{users.length === 1 ? "" : "s"}
      </div>

      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none select-none"
        style={{ pointerEvents: roomReady ? "auto" : "none" }}
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
        disabled={!roomReady}
        className="absolute bottom-4 right-4 z-10 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Clear board
      </button>

      {(!connected || !roomReady) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/40">
          <div className="rounded-2xl bg-white px-4 py-3 text-sm shadow-md">
            {statusLabel}
          </div>
        </div>
      )}
    </div>
  );
});

export default CanvasBoard;
