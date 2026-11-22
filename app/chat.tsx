"use client";

import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Person } from "../lib/social";
import type { createClient } from "../utils/supabase/client";

type Message = { id: string; sender_id: string; body: string; created_at: string };
const messageFields = "id,sender_id,body,created_at";
const messageTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" });

export function ChatDialog({ client, userId, friend, trackRead, onChange }: {
  client: NonNullable<ReturnType<typeof createClient>>;
  userId: string;
  friend: Person;
  trackRead: boolean;
  onChange: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
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
      const query = client.from("pacta_messages").select(messageFields)
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${friend.id}),and(sender_id.eq.${friend.id},recipient_id.eq.${userId})`)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(50);
      const { data, error } = await (signal ? query.abortSignal(signal) : query);
      if (signal?.aborted || startedAt !== revision.current) return;
      if (error) {
        setLoadError(["42P01", "PGRST205"].includes(error.code)
          ? "El chat aún no está activado en Supabase."
          : "No se pudo cargar el chat. Vuelve a intentarlo.");
      } else {
        setLoadError("");
        const latestIncoming = data?.find((item) => item.sender_id === friend.id);
        setMessages((previous) => {
          const recent = (data ?? []).reverse();
          return recent.length === previous.length && recent.every((item, index) => item.id === previous[index].id)
            ? previous : recent;
        });
        if (trackRead && latestIncoming && !document.hidden && latestIncoming.id !== lastRead.current) {
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
  }, [client, friend.id, onChange, trackRead, userId]);

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

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    const id = pending.current?.body === body ? pending.current.id : crypto.randomUUID();
    pending.current = { id, body };
    setSending(true);
    setSendError("");
    try {
      const { data, error } = await client.from("pacta_messages")
        .upsert({ id, recipient_id: friend.id, body }, { ignoreDuplicates: true })
        .select(messageFields).maybeSingle();
      if (error) throw error;
      revision.current++;
      pending.current = null;
      stickToBottom.current = true;
      if (data) setMessages((previous) => [...previous.filter((item) => item.id !== data.id), data].slice(-50));
      if (history.current) history.current.scrollTop = history.current.scrollHeight;
      setDraft("");
      onChange();
      void refresh();
    } catch {
      setSendError("No se pudo enviar. El mensaje sigue en el cuadro de texto para que puedas reintentarlo.");
    } finally {
      setSending(false);
    }
  }

  return <>
    <h2 id="dialog-title">Chat con {friend.name}</h2>
    <div className="chat-history" ref={history} role="log" aria-label="Mensajes" onScroll={(event) => {
      const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
      stickToBottom.current = scrollHeight - scrollTop - clientHeight < 60;
    }}>
      {loading && <p role="status">Cargando mensajes…</p>}
      {loadError && <p role="status">{loadError} <button className="back" onClick={() => refresh()}>Reintentar</button></p>}
      {!loading && !loadError && !messages.length && <p>Escribe el primer mensaje.</p>}
      {messages.map((message) => <div className={message.sender_id === userId ? "chat-bubble chat-mine" : "chat-bubble"} key={message.id}>
        <p>{message.body}</p>
        <time dateTime={message.created_at}>{messageTime.format(new Date(message.created_at))}</time>
      </div>)}
    </div>
    <form className="form" onSubmit={send}>
      <label>Mensaje<textarea value={draft} onChange={(event) => setDraft(event.target.value)}
        disabled={sending} rows={2} maxLength={1000} required placeholder="Escribe a tu amigo…" /></label>
      <button className="primary" disabled={sending || !draft.trim()}><Send size={16} />{sending ? "Enviando…" : "Enviar mensaje"}</button>
      {sendError && <p role="alert">{sendError}</p>}
    </form>
  </>;
}
