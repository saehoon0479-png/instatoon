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
  const size = useMemo(() => (tool === "pen" ? penSize : eraserSize), [tool, penSize, eraserSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 기본 설정
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

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
      // 지우개: 투명하게 지우기
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    }
    return ctx;
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const ctx = applyBrush();
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const ctx = applyBrush();
    if (!ctx) return;

    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
const savePNG = () => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const temp = document.createElement("canvas");
  temp.width = canvas.width;
  temp.height = canvas.height;

  const tctx = temp.getContext("2d");
  if (!tctx) return;

  // 항상 흰 배경
  tctx.fillStyle = "#ffffff";
  tctx.fillRect(0, 0, temp.width, temp.height);

  // 기존 그림 복사
  tctx.drawImage(canvas, 0, 0);

  temp.toBlob((blob) => {
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "instatoon.png";
    a.click();
    URL.revokeObjectURL(url);

    // 주소 업데이트
    window.history.replaceState(null, "", `?saved=${Date.now()}`);
  }, "image/png");
};

  return (
    <main
  style={{
    width: "100vw",
    height: "100vh",
    background: dark ? "#0f0f0f" : "#f5f5f5",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  }}
>


      {/* 왼쪽 툴바 */}
      <div
        style={{
          width: 260,
          background: "#2a2a2a",
          color: "white",
          borderRadius: 12,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          userSelect: "none",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700 }}>툴</div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setTool("pen")}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #444",
              background: tool === "pen" ? "#ffffff" : "#333",
              color: tool === "pen" ? "#111" : "#fff",
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
              background: tool === "eraser" ? "#ffffff" : "#333",
              color: tool === "eraser" ? "#111" : "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            지우개
          </button>
        </div>

        <div style={{ height: 1, background: "#444" }} />

        <div style={{ fontWeight: 700 }}>색</div>
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { name: "검정", value: "#000000" },
            { name: "빨강", value: "#e11d48" },
            { name: "파랑", value: "#2563eb" },
          ].map((c) => (
            <button
              key={c.value}
              onClick={() => setColor(c.value)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                border: color === c.value ? "3px solid #fff" : "2px solid #555",
                background: c.value,
                cursor: "pointer",
              }}
              title={c.name}
            />
          ))}
        </div>

        <div style={{ height: 1, background: "#444" }} />

        {tool === "pen" ? (
          <>
            <div style={{ fontWeight: 700 }}>선 굵기: {penSize}px</div>
            <input
              type="range"
              min={1}
              max={30}
              value={penSize}
              onChange={(e) => setPenSize(parseInt(e.target.value))}
            />
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700 }}>지우개 굵기: {eraserSize}px</div>
            <input
              type="range"
              min={5}
              max={80}
              value={eraserSize}
              onChange={(e) => setEraserSize(parseInt(e.target.value))}
            />
          </>
        )}

        <div style={{ height: 1, background: "#444" }} />

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

        <div style={{ fontSize: 12, color: "#aaa", marginTop: 6 }}>
          팁: 펜/지우개는 마우스 눌렀다 움직이면 됨
           <button onClick={savePNG}>저장 / 공유</button>
</div>
<button
  onClick={() => setDark(v => !v)}
  style={{
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #444",
    background: dark ? "#111" : "#fff",
    color: dark ? "#fff" : "#111",
    cursor: "pointer",
    fontWeight: 700,
    width: "100%",
    marginTop: 8,
  }}
>
  {dark ? "화이트 UI" : "다크 UI"}
</button>


      </div>

      <div
  style={{
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  }}
>
  <div
  style={{ position: "relative", width: 800, height: 800 }}
  onPointerEnter={() => setInsideCanvas(true)}
  onPointerLeave={() => setInsideCanvas(false)}
  onPointerMove={(e) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    setPointer({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }}
>
  <canvas
    ref={canvasRef}
    width={800}
    height={800}
    style={{
      background: "white",   // ✅ 도화지는 항상 흰색
      borderRadius: 12,
      touchAction: "none",
      cursor: "none",        // ✅ 기본 커서 숨김
    }}
    onPointerDown={(e) => {
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
      startDrawing(e as any);
    }}
    onPointerMove={(e) => draw(e as any)}
    onPointerUp={stopDrawing}
    onPointerLeave={stopDrawing}
  />

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
          tool === "eraser"
            ? "2px solid #ff4d4f"
            : "2px solid #333",
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
