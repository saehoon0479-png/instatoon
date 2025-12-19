"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Tool = "pen" | "eraser";

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#000000");
  const [penSize, setPenSize] = useState(4);
  const [eraserSize, setEraserSize] = useState(18);
  const [dark, setDark] = useState(true);

  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [insideCanvas, setInsideCanvas] = useState(false);

  const size = useMemo(
    () => (tool === "pen" ? penSize : eraserSize),
    [tool, penSize, eraserSize]
  );

  // Undo/Redo stacks (DataURL snapshots)
  const historyRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const MAX_HISTORY = 50;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 기본 설정
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // 초기 캔버스 상태를 history에 넣어둠
    try {
      historyRef.current = [canvas.toDataURL("image/png")];
    } catch {
      historyRef.current = [];
    }
  }, []);

  const takeSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    try {
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  };

  const restoreFromDataUrl = (dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
  };

  const applyBrush = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.lineWidth = size;

    if (tool === "pen") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
    } else {
      // 지우개: 실제로 투명하게 지움
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    }

    return ctx;
  };

  const updatePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPointer({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // 새 스트로크 시작 시 redo 초기화
    redoStackRef.current = [];

    const ctx = applyBrush();
    if (!ctx) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // ⭐ iPad/Safari 선택 방지(필수)
    e.preventDefault();

    if (!isDrawing) return;

    const ctx = applyBrush();
    if (!ctx) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (!canvas) return;

    // 스트로크 끝에서만 snapshot 저장
    const snap = takeSnapshot();
    if (!snap) return;

    const history = historyRef.current;
    const last = history[history.length - 1];
    if (last !== snap) {
      history.push(snap);
      if (history.length > MAX_HISTORY) history.shift();
    }

    // closePath 안전 처리
    const ctx = canvas.getContext("2d");
    ctx?.closePath?.();
  };

  // ✅ Undo/Redo는 "스택 이동"만 한다 (여기서 toDataURL 찍지 않음)
  const undo = () => {
    const history = historyRef.current;
    if (history.length <= 1) return;

    const current = history.pop();
    if (current) redoStackRef.current.push(current);

    const prev = history[history.length - 1];
    if (prev) restoreFromDataUrl(prev);
  };

  const redo = () => {
    const redoStack = redoStackRef.current;
    if (redoStack.length === 0) return;

    const next = redoStack.pop();
    if (!next) return;

    historyRef.current.push(next);
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();

    restoreFromDataUrl(next);
  };

  const clearAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 지운 상태를 history 초기 상태로 저장
    const snap = takeSnapshot();
    if (snap) {
      historyRef.current = [snap];
      redoStackRef.current = [];
    }
  };

  const savePNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 흰 배경 포함 저장
    const temp = document.createElement("canvas");
    temp.width = canvas.width;
    temp.height = canvas.height;

    const tctx = temp.getContext("2d");
    if (!tctx) return;

    tctx.fillStyle = "#ffffff";
    tctx.fillRect(0, 0, temp.width, temp.height);
    tctx.drawImage(canvas, 0, 0);

    const url = temp.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "instatoon.png";
    a.click();
  };

  // UI 스타일
  const bg = dark ? "#0f0f0f" : "#f5f5f5";
  const panelBg = dark ? "#1f1f1f" : "#ffffff";
  const panelText = dark ? "#ffffff" : "#111111";
  const panelBorder = dark ? "1px solid #2a2a2a" : "1px solid #e5e7eb";

  return (
    <main
      style={{
        width: "100vw",
        minHeight: "100vh",
        background: bg,
        padding: 16,
        boxSizing: "border-box",
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
      }}
    >
      {/* 왼쪽 툴바 */}
      <div
        style={{
          width: 280,
          background: panelBg,
          color: panelText,
          borderRadius: 12,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          userSelect: "none",
          border: panelBorder,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800 }}>INSTATOON</div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setTool("pen")}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #444",
              background: tool === "pen" ? (dark ? "#ffffff" : "#111") : "#333",
              color: tool === "pen" ? (dark ? "#111" : "#fff") : "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            펜
          </button>
          <button
            onClick={() => setTool("eraser")}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #444",
              background:
                tool === "eraser" ? (dark ? "#ffffff" : "#111") : "#333",
              color: tool === "eraser" ? (dark ? "#111" : "#fff") : "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            지우개
          </button>
        </div>

        {/* 색상 (펜일 때만 의미 있음) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 70, fontSize: 12, opacity: 0.8 }}>색상</div>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 44, height: 30, border: "none", background: "transparent" }}
            disabled={tool === "eraser"}
          />
          <div style={{ fontSize: 12, opacity: tool === "eraser" ? 0.5 : 0.8 }}>
            {tool === "eraser" ? "지우개는 색상 무시" : color}
          </div>
        </div>

        {/* 크기 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>펜 굵기</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{penSize}</div>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            value={penSize}
            onChange={(e) => setPenSize(Number(e.target.value))}
          />

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>지우개 크기</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{eraserSize}</div>
          </div>
          <input
            type="range"
            min={4}
            max={80}
            value={eraserSize}
            onChange={(e) => setEraserSize(Number(e.target.value))}
          />
        </div>

        {/* Undo/Redo */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={undo}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #444",
              background: "#333",
              color: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            실행취소
          </button>
          <button
            onClick={redo}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #444",
              background: "#333",
              color: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            다시실행
          </button>
        </div>

        {/* 기타 */}
        <button
          onClick={clearAll}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #444",
            background: "#333",
            color: "white",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          전체 지우기
        </button>

        <button
          onClick={savePNG}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #444",
            background: "#333",
            color: "white",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          PNG 저장
        </button>

        <button
          onClick={() => setDark((v) => !v)}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #444",
            background: dark ? "#ffffff" : "#111111",
            color: dark ? "#111" : "#fff",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          {dark ? "화이트 UI" : "다크 UI"}
        </button>

        <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
          iPad/Apple Pencil: Pointer Events 기반이라 그대로 사용 가능.
          <br />
          (압력으로 굵기 변화는 다음 단계)
        </div>
      </div>

      {/* 캔버스 영역 */}
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          paddingTop: 8,
        }}
      >
        <div
          style={{
            width: "min(92vw, 900px)",
            height: "min(92vw, 900px)",
            position: "relative",
            borderRadius: 12,
          }}
        >
          <canvas
            ref={canvasRef}
            width={900}
            height={900}
            style={{
              width: "100%",
              height: "100%",
              background: "white",
              borderRadius: 12,
              touchAction: "none",
              display: "block",
              // 원래 원형 커서가 있으니 기본 커서는 숨기는 게 깔끔함
              cursor: "none",
            }}
            onPointerEnter={() => setInsideCanvas(true)}
            onPointerLeave={() => {
              setInsideCanvas(false);
              stopDrawing();
            }}
            onPointerDown={(e) => {
              setInsideCanvas(true);
              updatePointer(e);
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
              startDrawing(e as any);
            }}
            onPointerMove={(e) => {
              updatePointer(e);
              draw(e as any);
            }}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
          />

          {/* 선택/드래그 방지용 오버레이(선택 방지) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              userSelect: "none",
              WebkitUserSelect: "none",
              pointerEvents: "none",
            }}
          />

          {/* 원형 커서 */}
          {insideCanvas && (
            <div
              style={{
                position: "absolute",
                left: pointer.x,
                top: pointer.y,
                width: tool === "eraser" ? eraserSize : penSize,
                height: tool === "eraser" ? eraserSize : penSize,
                transform: "translate(-50%, -50%)",
                borderRadius: "9999px",
                pointerEvents: "none",
                border:
                  tool === "eraser" ? "2px solid #ff4d4f" : "2px solid #333",
                background: "transparent",
                boxSizing: "border-box",
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
