 "use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Tool = "pen" | "eraser" | "line" | "rightAngle";
type SnapMode = "off" | "shift" | "always";
type Preset = "custom" | "feed11" | "feed45" | "feed_land" | "story" | "reels";
type Vec2 = { x: number; y: number };
type Pt = { x: number; y: number; t: number; p: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function dist(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function snapAngle0_45_90(from: Vec2, to: Vec2) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const r = Math.hypot(dx, dy);
  if (r < 0.0001) return to;
  const ang = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(ang / step) * step;
  return { x: from.x + Math.cos(snapped) * r, y: from.y + Math.sin(snapped) * r };
}
function presetToSize(p: Preset) {
  switch (p) {
    case "feed11":
      return { w: 1080, h: 1080 };
    case "feed45":
      return { w: 1080, h: 1350 }; // 4:5
    case "feed_land":
      return { w: 1080, h: 566 }; // 가로 피드(대략)
    case "story":
    case "reels":
      return { w: 1080, h: 1920 }; // 9:16
    default:
      return { w: 900, h: 900 };
  }
}

type RightAngleMode = "L" | "RECT";

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ===== 핵심 안정: e.buttons 대신 이 2개로만 판단 =====
  const activePointerIdRef = useRef<number | null>(null);
  const pointerDownRef = useRef(false);

  // ===== History =====
  const historyRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const MAX_HISTORY = 60;

  // ===== UI =====
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#000000");
  const [penSize, setPenSize] = useState(4);
  const [eraserSize, setEraserSize] = useState(18);
  const [pressureOn, setPressureOn] = useState(true);

  // smoothing
  const [smoothOn, setSmoothOn] = useState(true);
  const [baseAlpha, setBaseAlpha] = useState(0.25);
  const [speedFactor, setSpeedFactor] = useState(2.2);

  // snap
  const [snapMode, setSnapMode] = useState<SnapMode>("off");

  // theme / advanced
  const [darkUI, setDarkUI] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // size
  const [preset, setPreset] = useState<Preset>("custom");
  const [customW, setCustomW] = useState(900);
  const [customH, setCustomH] = useState(900);

  // cursor
  const [cursorScale, setCursorScale] = useState(1.0); // 표시용 배율
  const [cursorOn, setCursorOn] = useState(true);

  const cursorPosRef = useRef<Vec2 | null>(null);
  const [cursorPos, setCursorPos] = useState<Vec2 | null>(null);
  const [cursorVisible, setCursorVisible] = useState(false);

  const { canvasW, canvasH } = useMemo(() => {
    if (preset === "custom") return { canvasW: customW, canvasH: customH };
    const s = presetToSize(preset);
    return { canvasW: s.w, canvasH: s.h };
  }, [preset, customW, customH]);

  const uiBg = darkUI ? "#0b0b0f" : "#f6f6f9";
  const panelBg = darkUI ? "rgba(20,20,28,0.95)" : "rgba(255,255,255,0.95)";
  const panelBorder = darkUI ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const textColor = darkUI ? "#f3f3f7" : "#111";

  // ===== Pen state =====
  const lastRawRef = useRef<Pt | null>(null);
  const lastSmoothRef = useRef<Vec2 | null>(null);
  const lastDrawRef = useRef<Vec2 | null>(null);

  // ===== Shape state (✅ baseUrl 비동기 제거 → ImageData 동기 스냅샷) =====
  const shapeRef = useRef<{
    active: boolean;
    pointerId: number;
    start: Vec2;
    last: Vec2;
    moved: boolean;

    // runtime toggles
    snap: boolean;

    // tool behaviors
    kind: "line" | "rightAngle"; // pen-shift도 line으로 처리
    rightAngleMode: RightAngleMode; // L 또는 RECT
    rightAngleAsLine: boolean; // rightAngle에서 Shift = 임시 직선

    // locked style
    strokeStyle: string;
    lineWidth: number;

    // ✅ base snapshot (sync)
    base: ImageData | null;
  } | null>(null);

  // ===== Helpers =====
  function getCtx() {
    const c = canvasRef.current;
    return c ? c.getContext("2d") : null;
  }
  function toDataUrl() {
    const c = canvasRef.current;
    return c ? c.toDataURL("image/png") : null;
  }
  function pushHistory(url: string) {
    const h = historyRef.current;
    const last = h[h.length - 1];
    if (last === url) return;
    h.push(url);
    if (h.length > MAX_HISTORY) h.shift();
  }
  function resetRedo() {
    redoRef.current = [];
  }
  function restoreFromDataUrl(url: string) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = url;
  }
  function undo() {
    const h = historyRef.current;
    if (h.length <= 1) return;
    const cur = h.pop();
    if (cur) redoRef.current.push(cur);
    const prev = h[h.length - 1];
    if (prev) restoreFromDataUrl(prev);
  }
  function redo() {
    const r = redoRef.current;
    if (r.length === 0) return;
    const next = r.pop();
    if (!next) return;
    historyRef.current.push(next);
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    restoreFromDataUrl(next);
  }
  function clearAll() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const snap = toDataUrl();
    if (snap) {
      historyRef.current = [snap];
      redoRef.current = [];
    }
  }

  function savePNG(transparent: boolean) {
    const c = canvasRef.current;
    if (!c) return;
    const tmp = document.createElement("canvas");
    tmp.width = c.width;
    tmp.height = c.height;
    const tctx = tmp.getContext("2d");
    if (!tctx) return;
    if (!transparent) {
      tctx.fillStyle = "#fff";
      tctx.fillRect(0, 0, tmp.width, tmp.height);
    }
    tctx.drawImage(c, 0, 0);
    const url = tmp.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `instatoon_${c.width}x${c.height}.png`;
    a.click();
  }

  function getCanvasPoint(e: React.PointerEvent<HTMLCanvasElement>): Vec2 {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }

  function isSnapActive(shiftKey: boolean) {
    if (snapMode === "always") return true;
    if (snapMode === "shift") return shiftKey;
    return false;
  }

  function applyBrush(ctx: CanvasRenderingContext2D, pressure: number) {
    const base = tool === "eraser" ? eraserSize : penSize;
    const p = pressureOn ? clamp(pressure || 0.5, 0.05, 1) : 1;
    const w = base * (pressureOn ? (0.40 + 0.60 * p) : 1);

    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
    }
  }

  // ===== 펜: EMA + 속도 기반 + 보간 =====
  function drawPenSegment(ctx: CanvasRenderingContext2D, raw: Pt) {
    const lastRaw = lastRawRef.current;

    if (!lastRaw) {
      lastRawRef.current = raw;
      lastSmoothRef.current = { x: raw.x, y: raw.y };
      lastDrawRef.current = { x: raw.x, y: raw.y };

      ctx.beginPath();
      ctx.moveTo(raw.x, raw.y);
      ctx.lineTo(raw.x + 0.001, raw.y + 0.001);
      ctx.stroke();
      return;
    }

    const dt = Math.max(1, raw.t - lastRaw.t);
    const d = dist({ x: lastRaw.x, y: lastRaw.y }, { x: raw.x, y: raw.y });
    const speed = d / dt;

    const a0 = clamp(baseAlpha, 0.05, 0.9);
    const alpha = smoothOn ? clamp(a0 + speed * speedFactor, 0.06, 0.985) : 0.985;

    const prevSmooth = lastSmoothRef.current ?? { x: lastRaw.x, y: lastRaw.y };
    const sx = prevSmooth.x + alpha * (raw.x - prevSmooth.x);
    const sy = prevSmooth.y + alpha * (raw.y - prevSmooth.y);

    const lastDraw = lastDrawRef.current ?? prevSmooth;
    const segLen = dist(lastDraw, { x: sx, y: sy });

    const lw = Math.max(1, ctx.lineWidth);
    const step = clamp(lw * 0.22, 0.5, 4.0);

    if (segLen >= 0.01) {
      const n = Math.max(1, Math.ceil(segLen / step));
      ctx.beginPath();
      ctx.moveTo(lastDraw.x, lastDraw.y);
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        ctx.lineTo(lerp(lastDraw.x, sx, t), lerp(lastDraw.y, sy, t));
      }
      ctx.stroke();
      lastDrawRef.current = { x: sx, y: sy };
    }

    lastRawRef.current = raw;
    lastSmoothRef.current = { x: sx, y: sy };
  }

  // ✅ 도형 base 복구 (동기)
  function restoreShapeBase(ctx: CanvasRenderingContext2D, base: ImageData | null) {
    if (!base) return;
    ctx.putImageData(base, 0, 0);
  }

  function drawStraightLine(ctx: CanvasRenderingContext2D, start: Vec2, end: Vec2, snap: boolean, strokeStyle: string, lineWidth: number) {
    let e = end;
    if (snap) e = snapAngle0_45_90(start, e);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * rightAngle 모드:
   * - L: start -> corner -> end (기존 ㄱ자)
   * - RECT: start/end 를 대각 꼭짓점으로 보고 사각형(4변 닫힘)
   */
  function drawRightAngleSmart(
    ctx: CanvasRenderingContext2D,
    start: Vec2,
    end: Vec2,
    snap: boolean,
    asLine: boolean, // Shift = 임시 직선
    mode: RightAngleMode,
    strokeStyle: string,
    lineWidth: number
  ) {
    if (asLine) {
      drawStraightLine(ctx, start, end, snap, strokeStyle, lineWidth);
      return;
    }

    let e = end;
    // rightAngle는 기본적으로 axis-aligned가 자연스러워서 "각도 스냅"은 직선에서만 의미가 큰데,
    // 네 요구사항에 맞춰 snap이 켜져있으면 end를 0/45/90으로 보정해 주되,
    // RECT 모드에서는 사각형이 깨질 수 있어 L 모드에서만 적용.
    if (snap && mode === "L") {
      e = snapAngle0_45_90(start, e);
    }

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    ctx.beginPath();

    if (mode === "RECT") {
      // start, e 를 대각 꼭짓점으로 사각형 닫기
      const x1 = start.x;
      const y1 = start.y;
      const x2 = e.x;
      const y2 = e.y;

      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x1, y2);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      return;
    }

    // mode === "L"
    ctx.moveTo(start.x, start.y);
    const dx = Math.abs(e.x - start.x);
    const dy = Math.abs(e.y - start.y);
    if (dx >= dy) {
      ctx.lineTo(e.x, start.y);
      ctx.lineTo(e.x, e.y);
    } else {
      ctx.lineTo(start.x, e.y);
      ctx.lineTo(e.x, e.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ===== rightAngle의 "ㄱ -> 사각형 자동완성" 휴리스틱 =====
  const RECT_MIN = 10; // (캔버스 좌표) 가로/세로 둘다 이 값보다 크면 사각형 모드로 전환
  function computeRightAngleMode(start: Vec2, end: Vec2): RightAngleMode {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    // 둘 다 어느 정도 커지면 사각형(닫힘)으로: "ㄱ로 그리다가도 사각형이 쉽게"
    if (Math.min(dx, dy) >= RECT_MIN) return "RECT";
    return "L";
  }

  function endPointerSession() {
    pointerDownRef.current = false;
    activePointerIdRef.current = null;
    lastRawRef.current = null;
    lastSmoothRef.current = null;
    lastDrawRef.current = null;
  }

  // ===== Init / resize canvas =====
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    c.width = canvasW;
    c.height = canvasH;

    const ctx = c.getContext("2d");
    if (!ctx) return;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    const snap = toDataUrl();
    if (snap) {
      historyRef.current = [snap];
      redoRef.current = [];
    }

    shapeRef.current = null;
    endPointerSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasW, canvasH]);

  // ===== Pointer handlers =====
  const MOVED_THRESHOLD = 0.2;
  const COMMIT_THRESHOLD = 1.0;

  function beginShapeSession(
    ctx: CanvasRenderingContext2D,
    pointerId: number,
    start: Vec2,
    kind: "line" | "rightAngle",
    shiftKey: boolean
  ) {
    const base = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);

    const snapActive = isSnapActive(shiftKey); // line에서 적용. rightAngle(L)에서도 일부 적용.
    const asLine = kind === "rightAngle" ? !!shiftKey : false;

    const rightAngleMode: RightAngleMode =
      kind === "rightAngle" ? computeRightAngleMode(start, start) : "L";

    shapeRef.current = {
      active: true,
      pointerId,
      start,
      last: start,
      moved: false,
      snap: snapActive,
      kind,
      rightAngleMode,
      rightAngleAsLine: asLine,
      strokeStyle: color,
      lineWidth: penSize,
      base,
    };

    restoreShapeBase(ctx, base);
    if (kind === "line") {
      drawStraightLine(ctx, start, start, snapActive, color, penSize);
    } else {
      drawRightAngleSmart(ctx, start, start, snapActive, asLine, rightAngleMode, color, penSize);
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return;

    activePointerIdRef.current = e.pointerId;
    pointerDownRef.current = true;

    e.currentTarget.setPointerCapture(e.pointerId);

    const ctx = getCtx();
    if (!ctx) return;

    const pt = getCanvasPoint(e);
    const now = performance.now();

    // 커서 위치 갱신
    cursorPosRef.current = pt;
    setCursorPos(pt);
    setCursorVisible(true);

    // ===== 펜에서도 Shift = 임시 직선(요구사항) =====
    // 안정적으로: Shift로 시작한 드래그는 "line shape" 세션으로 처리 (프리뷰/커밋 모두 shape 파이프라인)
    const penShiftLine = tool === "pen" && e.shiftKey;

    // ===== Shape tools =====
    const isShapeTool = tool === "line" || tool === "rightAngle";
    if (isShapeTool || penShiftLine) {
      const kind: "line" | "rightAngle" =
        tool === "rightAngle" && !penShiftLine ? "rightAngle" : "line";
      beginShapeSession(ctx, e.pointerId, pt, kind, e.shiftKey);
      return;
    }

    if (tool === "pen" || tool === "eraser") {
      applyBrush(ctx, e.pressure ?? 0.5);
      lastRawRef.current = null;
      lastSmoothRef.current = null;
      lastDrawRef.current = null;
      drawPenSegment(ctx, { x: pt.x, y: pt.y, t: now, p: e.pressure ?? 0.5 });
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    // 커서: hover 중에도 원 표시 (드로잉 중이 아니어도)
    const ptHover = getCanvasPoint(e);
    cursorPosRef.current = ptHover;
    setCursorPos(ptHover);

    if (!pointerDownRef.current) return;
    if (activePointerIdRef.current !== e.pointerId) return;

    const ctx = getCtx();
    if (!ctx) return;

    const pt = ptHover;
    const now = performance.now();

    const s = shapeRef.current;
    if (s?.active) {
      if (s.pointerId !== e.pointerId) return;

      if (dist(s.start, pt) > MOVED_THRESHOLD) s.moved = true;

      // 실시간 토글 반영
      s.snap = isSnapActive(e.shiftKey);
      s.last = pt;

      if (s.kind === "rightAngle") {
        // Shift = 임시 직선 (드래그 중에도 즉시 반영)
        s.rightAngleAsLine = !!e.shiftKey;
        // ㄱ -> 사각형 자동완성도 드래그 중 즉시 반영
        s.rightAngleMode = computeRightAngleMode(s.start, s.last);
      }

      restoreShapeBase(ctx, s.base);

      if (s.kind === "line") {
        drawStraightLine(ctx, s.start, s.last, s.snap, s.strokeStyle, s.lineWidth);
      } else {
        drawRightAngleSmart(ctx, s.start, s.last, s.snap, s.rightAngleAsLine, s.rightAngleMode, s.strokeStyle, s.lineWidth);
      }
      return;
    }

    if (tool !== "pen" && tool !== "eraser") return;

    applyBrush(ctx, e.pressure ?? 0.5);
    drawPenSegment(ctx, { x: pt.x, y: pt.y, t: now, p: e.pressure ?? 0.5 });
  }

  function onPointerUpOrCancel(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerIdRef.current !== e.pointerId) return;

    const ctx = getCtx();
    if (!ctx) {
      endPointerSession();
      return;
    }

    const s = shapeRef.current;
    if (s?.active && s.pointerId === e.pointerId) {
      if (s.moved && dist(s.start, s.last) >= COMMIT_THRESHOLD) {
        restoreShapeBase(ctx, s.base);

        if (s.kind === "line") {
          drawStraightLine(ctx, s.start, s.last, s.snap, s.strokeStyle, s.lineWidth);
        } else {
          drawRightAngleSmart(ctx, s.start, s.last, s.snap, s.rightAngleAsLine, s.rightAngleMode, s.strokeStyle, s.lineWidth);
        }

        const snap = toDataUrl();
        if (snap) {
          pushHistory(snap);
          resetRedo();
        }
      } else {
        // 클릭만 하면 원복
        restoreShapeBase(ctx, s.base);
      }
      shapeRef.current = null;
      endPointerSession();
      return;
    }

    if (tool === "pen" || tool === "eraser") {
      const snap = toDataUrl();
      if (snap) {
        pushHistory(snap);
        resetRedo();
      }
    }

    endPointerSession();
  }

  function onPointerEnterCanvas() {
    setCursorVisible(true);
  }
  function onPointerLeaveCanvas() {
    setCursorVisible(false);
  }

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    left: 18,
    top: 18,
    width: 320,
    maxHeight: "calc(100vh - 24px)",
    overflow: "auto",
    background: panelBg,
    border: `1px solid ${panelBorder}`,
    borderRadius: 16,
    padding: 12,
    color: textColor,
    zIndex: 50,
    boxShadow: darkUI ? "0 16px 40px rgba(0,0,0,0.45)" : "0 16px 40px rgba(0,0,0,0.18)",
  };

  const canvasWrapStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    display: "grid",
    placeItems: "center",
  };

  const canvasBoxStyle: React.CSSProperties = {
    width: 900,
    height: 900,
    borderRadius: 18,
    overflow: "hidden",
    background: "#fff",
    boxShadow: darkUI ? "0 18px 55px rgba(0,0,0,0.55)" : "0 18px 55px rgba(0,0,0,0.15)",
    position: "relative",
  };

  const canvasStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "block",
    touchAction: "none",
    background: "#fff",
    cursor: cursorOn ? "none" : "default", // ✅ 기본 십자 제거
  };

  // 커서 표시 크기 (도구 크기 기반 + scale)
  const baseCursorSize = tool === "eraser" ? eraserSize : penSize;
  const cursorPx = Math.max(2, baseCursorSize * cursorScale);

  const cursorOverlayStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  };

  const cursorCircleStyle: React.CSSProperties = {
    position: "absolute",
    width: `${cursorPx}px`,
    height: `${cursorPx}px`,
    borderRadius: 9999,
    transform: "translate(-50%, -50%)",
    border: `1px solid ${darkUI ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.55)"}`,
    boxShadow: darkUI ? "0 0 0 1px rgba(0,0,0,0.35)" : "0 0 0 1px rgba(255,255,255,0.35)",
    background: "transparent",
    opacity: cursorVisible && cursorOn ? 1 : 0,
  };

  return (
    <main style={{ minHeight: "100vh", background: uiBg, color: textColor }}>
      {/* Panel */}
      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 900 }}>INSTAToon</div>
          <button style={miniBtn(darkUI)} onClick={() => setDarkUI((v) => !v)}>
            {darkUI ? "화이트" : "다크"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button style={miniBtn(darkUI)} onClick={() => setAdvancedOpen((v) => !v)}>
            고급설정 {advancedOpen ? "닫기" : "열기"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button style={btnStyle(tool === "pen", darkUI)} onClick={() => setTool("pen")}>
            펜
          </button>
          <button style={btnStyle(tool === "eraser", darkUI)} onClick={() => setTool("eraser")}>
            지우개
          </button>
          <button style={btnStyle(tool === "line", darkUI)} onClick={() => setTool("line")}>
            직선
          </button>
          <button style={btnStyle(tool === "rightAngle", darkUI)} onClick={() => setTool("rightAngle")}>
            직각/사각
          </button>
        </div>

        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 900 }}>색상</div>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          <div style={{ fontSize: 12, opacity: 0.8 }}>{color}</div>
        </div>

        <div style={secTitle(darkUI)}>펜 크기: {penSize}</div>
        <input style={{ width: "100%" }} type="range" min={1} max={40} value={penSize} onChange={(e) => setPenSize(parseInt(e.target.value, 10))} />

        <div style={secTitle(darkUI)}>지우개 크기: {eraserSize}</div>
        <input style={{ width: "100%" }} type="range" min={4} max={80} value={eraserSize} onChange={(e) => setEraserSize(parseInt(e.target.value, 10))} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          <button style={btnStyle(pressureOn, darkUI, "#7c3aed")} onClick={() => setPressureOn((v) => !v)}>
            압력 {pressureOn ? "ON" : "OFF"}
          </button>
          <button style={btnStyle(smoothOn, darkUI, "#7c3aed")} onClick={() => setSmoothOn((v) => !v)}>
            보정 {smoothOn ? "ON" : "OFF"}
          </button>
        </div>

        <div style={secTitle(darkUI)}>각도 스냅(0/45/90)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <button style={btnStyle(snapMode === "off", darkUI)} onClick={() => setSnapMode("off")}>
            OFF
          </button>
          <button style={btnStyle(snapMode === "shift", darkUI)} onClick={() => setSnapMode("shift")}>
            SHIFT
          </button>
          <button style={btnStyle(snapMode === "always", darkUI)} onClick={() => setSnapMode("always")}>
            ALWAYS
          </button>
        </div>

        <div style={{ fontSize: 11, opacity: 0.75, marginTop: 8, lineHeight: 1.35 }}>
          • <b>직각/사각 도구</b>: 기본은 ㄱ(두 선) 프리뷰 → 가로/세로가 커지면 자동으로 <b>사각형(닫힘)</b>으로 전환<br />
          • 직각/사각 도구에서 <b>Shift</b> = 임시 <b>직선</b><br />
          • 펜 도구에서 <b>Shift 누른 채 드래그</b> = 임시 <b>직선</b>
        </div>

        <div style={secTitle(darkUI)}>커서(원) 설정</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button style={btnStyle(cursorOn, darkUI, "#0ea5e9")} onClick={() => setCursorOn((v) => !v)}>
            커서 {cursorOn ? "ON" : "OFF"}
          </button>
          <div style={{ fontSize: 12, opacity: 0.9, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            배율: {cursorScale.toFixed(2)}
          </div>
        </div>
        <input
          style={{ width: "100%", marginTop: 6 }}
          type="range"
          min={0.5}
          max={3.0}
          step={0.05}
          value={cursorScale}
          onChange={(e) => setCursorScale(parseFloat(e.target.value))}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          <button style={btnStyle(false, darkUI)} onClick={undo}>
            실행취소
          </button>
          <button style={btnStyle(false, darkUI)} onClick={redo}>
            다시실행
          </button>
          <button style={btnStyle(false, darkUI)} onClick={clearAll}>
            전체 지우기
          </button>
          <button style={btnStyle(false, darkUI)} onClick={() => savePNG(false)}>
            PNG(흰 배경)
          </button>
          <button style={btnStyle(false, darkUI)} onClick={() => savePNG(true)}>
            PNG(투명)
          </button>
        </div>

        <div style={secTitle(darkUI)}>프리셋</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button style={btnStyle(preset === "feed11", darkUI)} onClick={() => setPreset("feed11")}>
            피드 1:1
          </button>
          <button style={btnStyle(preset === "feed45", darkUI)} onClick={() => setPreset("feed45")}>
            피드 4:5
          </button>
          <button style={btnStyle(preset === "feed_land", darkUI)} onClick={() => setPreset("feed_land")}>
            피드 가로
          </button>
          <button style={btnStyle(preset === "story", darkUI)} onClick={() => setPreset("story")}>
            스토리
          </button>
          <button style={btnStyle(preset === "reels", darkUI)} onClick={() => setPreset("reels")}>
            릴스
          </button>
          <button style={btnStyle(preset === "custom", darkUI)} onClick={() => setPreset("custom")}>
            커스텀
          </button>
        </div>

        {preset === "custom" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>가로</div>
              <input
                style={inputStyle(darkUI)}
                type="number"
                value={customW}
                onChange={(e) => setCustomW(clamp(parseInt(e.target.value || "1", 10), 100, 6000))}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>세로</div>
              <input
                style={inputStyle(darkUI)}
                type="number"
                value={customH}
                onChange={(e) => setCustomH(clamp(parseInt(e.target.value || "1", 10), 100, 6000))}
              />
            </div>
          </div>
        )}

        {advancedOpen && (
          <>
            <div style={secTitle(darkUI)}>고급: 보정 강도(base α): {baseAlpha.toFixed(2)}</div>
            <input
              style={{ width: "100%" }}
              type="range"
              min={0.05}
              max={0.85}
              step={0.01}
              value={baseAlpha}
              onChange={(e) => setBaseAlpha(parseFloat(e.target.value))}
            />
            <div style={secTitle(darkUI)}>고급: 속도 민감도: {speedFactor.toFixed(2)}</div>
            <input
              style={{ width: "100%" }}
              type="range"
              min={0}
              max={6}
              step={0.05}
              value={speedFactor}
              onChange={(e) => setSpeedFactor(parseFloat(e.target.value))}
            />
          </>
        )}

        <div style={{ marginTop: 10, fontSize: 11, opacity: 0.75 }}>
          문서: {canvasW}×{canvasH}
        </div>
      </div>

      {/* Canvas */}
      <div style={canvasWrapStyle}>
        <div style={canvasBoxStyle}>
          <canvas
            ref={canvasRef}
            style={canvasStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUpOrCancel}
            onPointerCancel={onPointerUpOrCancel}
            onPointerEnter={onPointerEnterCanvas}
            onPointerLeave={onPointerLeaveCanvas}
          />

          {/* ✅ 원형 커서 오버레이 */}
          <div style={cursorOverlayStyle}>
            {cursorOn && cursorPos && (
              <div
                style={{
                  ...cursorCircleStyle,
                  left: `${(cursorPos.x / canvasW) * 100}%`,
                  top: `${(cursorPos.y / canvasH) * 100}%`,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function btnStyle(active: boolean, darkUI: boolean, activeColor?: string): React.CSSProperties {
  const bg = darkUI ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const bd = darkUI ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const on = activeColor ?? (darkUI ? "#7c3aed" : "#111827");
  return {
    padding: "10px 10px",
    borderRadius: 12,
    border: `1px solid ${active ? "transparent" : bd}`,
    background: active ? on : bg,
    color: active ? "#fff" : darkUI ? "#f3f3f7" : "#111",
    fontWeight: 900,
    cursor: "pointer",
  };
}
function miniBtn(darkUI: boolean): React.CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 10,
    border: `1px solid ${darkUI ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
    background: darkUI ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    color: darkUI ? "#f3f3f7" : "#111",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 12,
  };
}
function secTitle(darkUI: boolean): React.CSSProperties {
  return { marginTop: 12, marginBottom: 6, fontSize: 12, fontWeight: 900, opacity: darkUI ? 0.9 : 0.95 };
}
function inputStyle(darkUI: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 10px",
    borderRadius: 12,
    border: `1px solid ${darkUI ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
    background: darkUI ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    color: darkUI ? "#f3f3f7" : "#111",
    outline: "none",
  };
}