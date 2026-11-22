"use client";

import { Send, Smile } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatTarget } from "../lib/social";
import type { createClient } from "../utils/supabase/client";

import { ChatPhoto, PhotoComposer, photoBucket, type PhotoAttachment } from "./chat-photo";
import { VoiceComposer, VoicePlayer, voiceBucket, type VoiceRecording } from "./voice-note";

type Message = { id: string; sender_id: string; body: string; created_at: string; audio_path?: string | null; photo_path?: string | null };
const emojis = ["😀", "😂", "😊", "😍", "😅", "🥲", "😎", "🤝", "👍", "🙌", "❤️", "🔥", "🎉", "🍕", "🍻", "💸"];
const messageTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" });

export function ChatDialog({ client, userId, target, trackRead, onChange }: {
  client: NonNullable<ReturnType<typeof createClient>>;
  userId: string;
  target: ChatTarget;
  trackRead: boolean;
  onChange: () => void;
}) {
  const isGroup = target.kind === "group";
  const table = isGroup ? "pacta_group_messages" : "pacta_messages";
  const [messages, setMessages] = useState<Message[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textField = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const inFlight = useRef(false);
  const revision = useRef(0);
  const pending = useRef<{ id: string; body: string } | null>(null);
  const history = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastRead = useRef<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const startedAt = revision.current;
    try {
      const history = client.from(table).select("*");
      const conversation = isGroup ? history.eq("group_id", target.id)
        : history.or(`and(sender_id.eq.${userId},recipient_id.eq.${target.id}),and(sender_id.eq.${target.id},recipient_id.eq.${userId})`);
      const query = conversation.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(50);
      const { data, error } = await (signal ? query.abortSignal(signal) : query);
      if (signal?.aborted || startedAt !== revision.current) return;
      if (error) {
        setLoadError(["42P01", "PGRST205"].includes(error.code)
          ? isGroup ? "El chat de grupo aún no está activado en Supabase." : "El chat aún no está activado en Supabase."
          : "No se pudo cargar el chat. Vuelve a intentarlo.");
      } else {
        setLoadError("");
        const latestIncoming = data?.find((item) => item.sender_id !== userId);
        setMessages((previous) => {
          const recent = (data ?? []).reverse();
          return recent.length === previous.length && recent.every((item, index) => item.id === previous[index].id)
            ? previous : recent;
        });
        if (!isGroup && trackRead && latestIncoming && !document.hidden && latestIncoming.id !== lastRead.current) {
          const id = latestIncoming.id;
          lastRead.current = id;
          void (async () => {
            const { error } = await client.rpc("pacta_read_chat", { p_message: id });
            if (!error) onChange();
            else if (lastRead.current === id) lastRead.current = null;
          })();
        }
      }
    } catch {
      if (!signal?.aborted) setLoadError("No se pudo cargar el chat. Vuelve a intentarlo.");
    } finally {
      inFlight.current = false;
      if (!signal?.aborted) setLoading(false);
    }
  }, [client, isGroup, onChange, table, target.id, trackRead, userId]);

  useEffect(() => {
    const controller = new AbortController();
    const check = () => {
      if (!document.hidden) void refresh(controller.signal);
    };
    check();
    const timer = window.setInterval(check, 4500);
    document.addEventListener("visibilitychange", check);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [refresh]);

  useEffect(() => {
    if (stickToBottom.current && history.current) {
      history.current.scrollTop = history.current.scrollHeight;
    }
  }, [messages]);

  async function sendMessage(id: string, body: string, attachment?: { audio_path: string } | { photo_path: string }) {
    const destination = isGroup ? { group_id: target.id } : { recipient_id: target.id };
    const { data, error } = await client.from(table)
      .upsert({ id, ...destination, body, ...attachment }, { ignoreDuplicates: true })
      .select("*").maybeSingle();
    if (error) throw error;
    revision.current++;
    stickToBottom.current = true;
    if (data) setMessages((previous) => [...previous.filter((item) => item.id !== data.id), data].slice(-50));
    if (history.current) history.current.scrollTop = history.current.scrollHeight;
    onChange();
    void refresh();
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    const id = pending.current?.body === body ? pending.current.id : crypto.randomUUID();
    pending.current = { id, body };
    setSending(true);
    setSendError("");
    try {
      await sendMessage(id, body);
      pending.current = null;
      setDraft("");
      setEmojiOpen(false);
    } catch {
      setSendError("No se pudo enviar. El mensaje sigue en el cuadro de texto para que puedas reintentarlo.");
    } finally {
      setSending(false);
    }
  }

  async function sendAttachment(file: VoiceRecording | PhotoAttachment, kind: "audio" | "photo") {
    if (sending) return false;
    setSending(true);
    setSendError("");
    const prefix = isGroup ? `groups/${target.id}/${userId}` : `${userId}/${target.id}`;
    const path = `${prefix}/${file.id}.${file.extension}`;
    try {
      const { error } = await client.storage.from(kind === "audio" ? voiceBucket : photoBucket).upload(path, file.blob, {
        contentType: file.blob.type,
        upsert: false,
      });
      if (error && error.status !== 409 && error.statusCode !== "409") throw error;
      if (kind === "audio") await sendMessage(file.id, "Mensaje de voz", { audio_path: path });
      else await sendMessage(file.id, "Foto", { photo_path: path });
      return true;
    } catch {
      setSendError(kind === "audio" ? "No se pudo enviar el audio. La grabación sigue disponible para reintentar."
        : "No se pudo enviar la foto. Puedes volver a intentarlo sin elegirla otra vez.");
      return false;
    } finally {
      setSending(false);
    }
  }

  function insertEmoji(emoji: string) {
    const field = textField.current;
    const start = field?.selectionStart ?? draft.length;
    const end = field?.selectionEnd ?? start;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    if (next.length > 1000) return;
    setDraft(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  return <>
    <h2 id="dialog-title">{isGroup ? "Chat de" : "Chat con"} {target.name}</h2>
    <div className="chat-history" ref={history} role="log" aria-label="Mensajes" onScroll={(event) => {
      const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
      stickToBottom.current = scrollHeight - scrollTop - clientHeight < 60;
    }}>
      {loading && <p role="status">Cargando mensajes…</p>}
      {loadError && <p role="status">{loadError} <button className="back" onClick={() => refresh()}>Reintentar</button></p>}
      {!loading && !loadError && !messages.length && <p>Escribe el primer mensaje.</p>}
      {messages.map((message) => <div className={message.sender_id === userId ? "chat-bubble chat-mine" : "chat-bubble"} key={message.id}>
        {target.kind === "group" && message.sender_id !== userId && <strong className="chat-author">
          {target.members.find((member) => member.id === message.sender_id)?.name ?? "Miembro del grupo"}
        </strong>}
        {message.photo_path ? <ChatPhoto client={client} path={message.photo_path} />
          : message.audio_path ? <VoicePlayer client={client} path={message.audio_path} /> : <p>{message.body}</p>}
        <time dateTime={message.created_at}>{messageTime.format(new Date(message.created_at))}</time>
      </div>)}
    </div>
    <form className="form" onSubmit={send}>
      <label>Mensaje<textarea ref={textField} value={draft} onChange={(event) => setDraft(event.target.value)}
        disabled={sending} rows={2} maxLength={1000} required placeholder={isGroup ? "Escribe al grupo…" : "Escribe a tu amigo…"} /></label>
      <div className="chat-tools">
        <button className="icon-button" type="button" disabled={sending} aria-label="Emojis" title="Emojis"
          aria-expanded={emojiOpen} onClick={() => setEmojiOpen(!emojiOpen)}><Smile size={19} /></button>
        <VoiceComposer sending={sending} send={(recording) => sendAttachment(recording, "audio")} />
        <PhotoComposer sending={sending} send={(photo) => sendAttachment(photo, "photo")} />
      </div>
      {emojiOpen && <div className="emoji-picker" role="group" aria-label="Seleccionar emoji">
        {emojis.map((emoji) => <button type="button" disabled={sending} key={emoji} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}
      </div>}
      <button className="primary" disabled={sending || !draft.trim()}><Send size={16} />{sending ? "Enviando…" : "Enviar mensaje"}</button>
      {sendError && <p role="alert">{sendError}</p>}
    </form>
  </>;
}
