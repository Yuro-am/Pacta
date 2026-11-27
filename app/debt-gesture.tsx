"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function DebtGesture({ children, open, trash }: {
  children: ReactNode;
  open: () => void;
  trash?: () => void;
}) {
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const triggered = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);

  function stop() {
    clearTimeout(timer.current);
    gesture.current = null;
  }

  function reveal() {
    triggered.current = true;
    stop();
    trash?.();
  }

  return <button className={trash ? "debt-row can-trash" : "debt-row"}
    onClick={(event) => {
      if (event.detail === 0 || !triggered.current) open();
    }}
    onPointerDown={(event) => {
      triggered.current = false;
      if (!trash || !event.isPrimary || event.pointerType !== "touch") return;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      timer.current = setTimeout(reveal, 500);
    }}
    onPointerMove={(event) => {
      const start = gesture.current;
      if (start?.id !== event.pointerId) return;
      const x = Math.abs(event.clientX - start.x);
      const y = Math.abs(event.clientY - start.y);
      if (x > 10 || y > 10) clearTimeout(timer.current);
      if (y > 20 && y >= x) stop();
    }}
    onPointerUp={stop}
    onPointerCancel={stop}
    onLostPointerCapture={stop}
    onContextMenu={(event) => { if (trash && (gesture.current || triggered.current)) event.preventDefault(); }}>
    {children}
  </button>;
}
