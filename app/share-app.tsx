"use client";

import { Copy, Share2 } from "lucide-react";
import { useRef, useState } from "react";
import { publicAppUrl } from "../lib/shared-debts";

export function ShareAppButton({ onClick, className }: { onClick: () => void; className: string }) {
  return <button type="button" className={className} onClick={onClick}>
    <Share2 size={19} /> Compartir app
  </button>;
}

export function ShareAppDialog() {
  const url = publicAppUrl(window.location.origin).href;
  const link = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setFeedback("Enlace copiado.");
    } catch {
      link.current?.focus();
      link.current?.select();
      setFeedback("Copia el enlace seleccionado.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "PACTA", text: "Únete a PACTA para compartir deudas entre amigos.", url });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        await copy();
      }
    }
  }

  return <>
    <h2 id="dialog-title">Compartir PACTA</h2>
    <p className="dialog-description">Envía este enlace para que tus amigos puedan abrir la app y crear una cuenta.</p>
    <div className="form">
      <label>Enlace de PACTA<input ref={link} readOnly value={url} onFocus={(event) => event.currentTarget.select()} /></label>
      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={copy}><Copy size={17} /> Copiar enlace</button>
        {typeof navigator.share === "function" && <ShareAppButton className="primary" onClick={share} />}
      </div>
    </div>
    {feedback && <p className="dialog-description" role="status">{feedback}</p>}
  </>;
}
