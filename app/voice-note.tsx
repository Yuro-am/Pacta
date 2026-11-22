"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { createClient } from "../utils/supabase/client";

const formats = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg", "audio/wav": "wav" } as const;
const maxSeconds = 60;
const maxBytes = 5 * 1024 * 1024;
export const voiceBucket = "pacta-voice";
export type VoiceRecording = { id: string; blob: Blob; extension: string };
type Phase = "idle" | "requesting" | "recording" | "ready";
type Client = NonNullable<ReturnType<typeof createClient>>;

export function VoiceComposer({ sending, send }: {
  sending: boolean;
  send: (recording: VoiceRecording) => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<VoiceRecording | null>(null);
  const objectUrl = useRef("");
  const active = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      clearInterval(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Este navegador no permite grabar audios. Prueba desde el navegador del móvil.");
      return;
    }
    setError("");
    setPhase("requesting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const mimeType = Object.keys(formats).find((format) => MediaRecorder.isTypeSupported(format));
      const current = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      recorder.current = current;
      const chunks: Blob[] = [];
      current.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
      current.onstop = () => {
        clearInterval(timer.current);
        media.getTracks().forEach((track) => track.stop());
        if (!active.current) return;
        const rawType = (current.mimeType || chunks[0]?.type || "").split(";")[0].toLowerCase();
        const type = rawType === "video/mp4" ? "audio/mp4" : rawType === "video/webm" ? "audio/webm" : rawType;
        const extension = formats[type as keyof typeof formats];
        const blob = new Blob(chunks, { type });
        if (!extension || !blob.size || blob.size > maxBytes) {
          setError("No se pudo guardar el audio. Prueba una grabación breve.");
          setPhase("idle");
          return;
        }
        audio.current = { id: crypto.randomUUID(), blob, extension };
        objectUrl.current = URL.createObjectURL(blob);
        setPreview(objectUrl.current);
        setPhase("ready");
      };
      current.onerror = () => {
        clearInterval(timer.current);
        media.getTracks().forEach((track) => track.stop());
        if (active.current) {
          setError("Se interrumpió la grabación. Inténtalo otra vez.");
          setPhase("idle");
        }
      };
      const started = Date.now();
      current.start();
      setSeconds(0);
      setPhase("recording");
      timer.current = window.setInterval(() => {
        const elapsed = Math.min(maxSeconds, Math.floor((Date.now() - started) / 1000));
        setSeconds(elapsed);
        if (elapsed === maxSeconds && current.state === "recording") current.stop();
      }, 250);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (active.current) {
        setError("No se pudo usar el micrófono. Revisa el permiso del navegador.");
        setPhase("idle");
      }
    }
  }

  function discard() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
    audio.current = null;
    setPreview("");
    setPhase("idle");
  }

  return <div className="voice-composer">
    {phase === "idle" && <button className="icon-button" type="button" onClick={start}
      disabled={sending} aria-label="Grabar audio" title="Grabar audio"><Mic size={18} /></button>}
    {phase === "requesting" && <small role="status">Esperando permiso del micrófono…</small>}
    {phase === "recording" && <button className="secondary" type="button" onClick={() => {
      if (recorder.current?.state === "recording") recorder.current.stop();
    }}><Square size={15} /> Detener grabación · {seconds} s</button>}
    {phase === "ready" && <div className="voice-draft">
      <audio controls preload="metadata" src={preview} aria-label="Vista previa del audio" />
      <div className="dialog-actions">
        <button className="secondary" type="button" onClick={discard} disabled={sending}>Descartar</button>
        <button className="primary" type="button" disabled={sending} onClick={async () => {
          if (audio.current && await send(audio.current)) discard();
        }}>{sending ? "Enviando…" : "Enviar audio"}</button>
      </div>
    </div>}
    {error && <small role="alert">{error}</small>}
  </div>;
}

export function VoicePlayer({ client, path }: { client: Client; path: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const active = useRef(false);
  const objectUrl = useRef("");

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await client.storage.from(voiceBucket).download(path);
      if (error || !data) throw error;
      if (!active.current) return;
      objectUrl.current = URL.createObjectURL(data);
      setUrl(objectUrl.current);
    } catch {
      if (active.current) setError("No se pudo cargar el audio.");
    } finally {
      if (active.current) setLoading(false);
    }
  }

  return url ? <audio controls preload="metadata" src={url} aria-label="Nota de voz" />
    : <>
      <button className="voice-play" type="button" onClick={load} disabled={loading}>
        <Mic size={15} /> {loading ? "Cargando audio…" : "Escuchar audio"}
      </button>
      {error && <small role="alert">{error}</small>}
    </>;
}
