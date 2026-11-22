"use client";

import { ImagePlus, Image as ImageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { createClient } from "../utils/supabase/client";

const formats = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as const;
export const photoBucket = "pacta-photos";
export type PhotoAttachment = { id: string; blob: Blob; extension: string };

export function PhotoComposer({ sending, send }: {
  sending: boolean;
  send: (photo: PhotoAttachment) => Promise<boolean>;
}) {
  const chooser = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PhotoAttachment | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function choose(file?: File) {
    if (!file) return;
    const extension = formats[file.type as keyof typeof formats];
    if (!extension || !file.size || file.size > 8 * 1024 * 1024) {
      setError("Elige una imagen JPG, PNG, WebP o GIF de hasta 8 MB.");
      return;
    }
    setError("");
    setPreview("");
    setPhoto({ id: crypto.randomUUID(), blob: file, extension });
  }

  return <div className="photo-composer">
    <input className="sr-only" type="file" ref={chooser} tabIndex={-1} aria-label="Seleccionar archivo de foto"
      accept={Object.keys(formats).join(",")} disabled={sending} onChange={(event) => {
        choose(event.currentTarget.files?.[0]);
        event.currentTarget.value = "";
      }} />
    {!photo ? <button className="icon-button" type="button" disabled={sending} onClick={() => chooser.current?.click()}
      aria-label="Adjuntar foto" title="Adjuntar foto"><ImagePlus size={19} /></button>
      : <div className="photo-draft">
        {preview && <img src={preview} alt="Vista previa de la foto" onError={() => { setPhoto(null); setError("No se pudo abrir esta imagen."); }} />}
        <div className="dialog-actions">
          <button className="secondary" type="button" disabled={sending} onClick={() => setPhoto(null)}>Descartar foto</button>
          <button className="primary" type="button" disabled={sending || !preview} onClick={async () => {
            if (await send(photo)) setPhoto(null);
          }}>{sending ? "Enviando…" : "Enviar foto"}</button>
        </div>
      </div>}
    {error && <small role="alert">{error}</small>}
  </div>;
}

export function ChatPhoto({ client, path }: { client: NonNullable<ReturnType<typeof createClient>>; path: string }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
      const { data, error } = await client.storage.from(photoBucket).download(path);
      if (error || !data) throw error;
      if (!active.current) return;
      objectUrl.current = URL.createObjectURL(data);
      setUrl(objectUrl.current);
    } catch {
      if (active.current) setError("No se pudo abrir la foto.");
    } finally {
      if (active.current) setLoading(false);
    }
  }

  return url ? <img className="chat-photo" src={url} alt="Foto compartida en el chat" onError={() => {
    URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
    setUrl("");
    setError("No se pudo abrir la foto.");
  }} /> : <>
    <button className="voice-play" type="button" disabled={loading} onClick={load}>
      <ImageIcon size={17} /> {loading ? "Abriendo foto…" : "Ver foto"}
    </button>
    {error && <small role="alert">{error}</small>}
  </>;
}
