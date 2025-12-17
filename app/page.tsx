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

  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        background: "#1e1e1e",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 16,
        padding: 16,
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
        </div>
      </div>

      {/* 캔버스 */}
      <canvas
        ref={canvasRef}
        width={800}
        height={800}
        style={{
          background: "white",
          borderRadius: "12px",
          cursor: tool === "pen" ? "crosshair" : "cell",
          touchAction: "none",
        }}
       onPointerDown={(e) => {
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  startDrawing(e as any);
}}
onPointerMove={(e) => draw(e as any)}
onPointerUp={stopDrawing}
onPointerLeave={stopDrawing}
      />
    </main>
  );
}
