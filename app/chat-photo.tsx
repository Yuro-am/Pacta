"use client";

import { Camera, ImagePlus, Image as ImageIcon, SwitchCamera, X } from "lucide-react";
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
  const cameraDialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState("");
  const [switching, setSwitching] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [photo, setPhoto] = useState<PhotoAttachment | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cameraOpen) return;
    const dialog = cameraDialog.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [cameraOpen]);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    const player = video.current;
    if (!cameraOpen || !player) return;
    let closed = false;
    let stream: MediaStream | undefined;

    async function openCamera(player: HTMLVideoElement) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: switching ? { exact: facing } : { ideal: facing } },
        });
        if (closed) stream.getTracks().forEach((track) => track.stop());
        else player.srcObject = stream;
      } catch {
        if (closed) return;
        setCameraError(switching
          ? "No se pudo abrir esa cámara. Puedes volver a cambiar."
          : "No se pudo abrir la cámara. Revisa el permiso del navegador.");
      }
    }

    void openCamera(player);
    return () => {
      closed = true;
      stream?.getTracks().forEach((track) => track.stop());
      player.srcObject = null;
    };
  }, [cameraOpen, facing, switching]);

  function changeCamera() {
    const current = (video.current?.srcObject as MediaStream | null)?.getVideoTracks()[0]?.getSettings().facingMode;
    setCameraReady(false);
    setCameraError("");
    setSwitching(true);
    setFacing((current ?? facing) === "user" ? "environment" : "user");
  }

  async function takePhoto() {
    const player = video.current;
    if (!player?.videoWidth || !player.videoHeight || capturing) return;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 2048 / Math.max(player.videoWidth, player.videoHeight));
      canvas.width = Math.round(player.videoWidth * scale);
      canvas.height = Math.round(player.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      // Save the same unmirrored frame shown in the preview.
      context.drawImage(player, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Photo unavailable");
      setPreview("");
      setPhoto({ id: crypto.randomUUID(), blob, extension: "jpg" });
      setCameraOpen(false);
    } catch {
      setCameraError("No se pudo tomar la foto. Inténtalo de nuevo.");
    } finally {
      setCapturing(false);
    }
  }

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
    {cameraOpen && <dialog ref={cameraDialog} className="chat-camera" aria-label="Cámara"
      onCancel={(event) => {
        event.preventDefault();
        if (!capturing) setCameraOpen(false);
      }}>
      <button className="camera-close icon-button" type="button" aria-label="Cerrar cámara" disabled={capturing}
        onClick={() => setCameraOpen(false)}><X size={22} /></button>
      <div className="camera-view">
        <video key={facing} ref={video} autoPlay playsInline muted aria-label="Vista previa de la cámara"
          onCanPlay={() => setCameraReady(true)} />
        {cameraError ? <p className="camera-status" role="alert">{cameraError}</p>
          : !cameraReady && <p className="camera-status" role="status">Abriendo cámara…</p>}
      </div>
      <div className="camera-controls">
        <button className="camera-shutter" type="button" aria-label="Tomar foto" disabled={!cameraReady || capturing || sending}
          onClick={() => void takePhoto()}><Camera size={26} /></button>
        <button className="camera-switch icon-button" type="button" aria-label="Cambiar cámara" title="Cambiar cámara"
          disabled={capturing || (!cameraReady && !cameraError)} onClick={changeCamera}><SwitchCamera size={23} /></button>
      </div>
    </dialog>}
    {!photo ? <div className="photo-actions">
        <button className="icon-button" type="button" disabled={sending} aria-label="Abrir cámara" title="Abrir cámara"
          onClick={() => {
            setError("");
            setCameraError("");
            setCameraReady(false);
            setSwitching(false);
            setFacing("environment");
            setCameraOpen(true);
          }}><Camera size={19} /></button>
        <button className="icon-button" type="button" disabled={sending} onClick={() => chooser.current?.click()}
          aria-label="Adjuntar foto" title="Adjuntar foto"><ImagePlus size={19} /></button>
      </div>
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
