"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatTarget } from "../lib/social";
import type { createClient } from "../utils/supabase/client";

const closingTopics = new Map<string, Promise<unknown>>();

type Activity = "text" | "audio";

type Client = NonNullable<ReturnType<typeof createClient>>;

export function useChatLive(client: Client, userId: string, target: ChatTarget, audioActive: boolean, onMessage: () => void) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const publish = useRef<((active: boolean, kind?: Activity) => void) | null>(null);
  const stopTimer = useRef<number | undefined>(undefined);
  const lastSent = useRef(0);
  const typingNow = useRef(false);
  const audioNow = useRef(false);
  const topic = target.kind === "group"
    ? `pacta-chat-group:${target.id}`
    : `pacta-chat-friend:${[userId, target.id].sort().join(":")}`;
  const isGroup = target.kind === "group";

  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  useEffect(() => {
    let disposed = false;
    let disconnect: (() => void) | undefined;
    setActivity(null);

    function connect() {
      if (disposed) return;
      const session = crypto.randomUUID();
      const participants = new Map<string, { timer: number; kind: Activity }>();
      function updateActivity() {
        const active = [...participants.values()];
        setActivity(active.some(({ kind }) => kind === "audio") ? "audio" : active.length ? "text" : null);
      }
      let joined = false;
      const channel = client.channel(topic, { config: { private: true } })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          if (disposed) return;
          const key = payload?.key;
          if (typeof key !== "string" || key === session || key.length !== 36) return;
          clearTimeout(participants.get(key)?.timer);
          if (payload.active === true) {
            const kind = payload.kind === "audio" ? "audio" : "text";
            const timer = window.setTimeout(() => {
              participants.delete(key);
              updateActivity();
            }, 2600);
            participants.set(key, { timer, kind });
          } else {
            participants.delete(key);
          }
          updateActivity();
        });

      if (isGroup) {
        channel.on("postgres_changes", {
          schema: "public", table: "pacta_group_messages", event: "INSERT", filter: `group_id=eq.${target.id}`,
        }, () => onMessageRef.current());
      } else {
        channel.on("postgres_changes", {
          schema: "public", table: "pacta_messages", event: "INSERT", filter: `recipient_id=eq.${userId}`,
        }, ({ new: message }) => {
          if (message.sender_id === target.id) onMessageRef.current();
        });
      }

      channel.subscribe((status) => {
        joined = status === "SUBSCRIBED";
        if (joined && !disposed) onMessageRef.current();
      });

      publish.current = (active, kind) => {
        if (joined) void channel.send({
          type: "broadcast", event: "typing",
          payload: kind === "audio" ? { key: session, active, kind } : { key: session, active },
        });
      };

      disconnect = () => {
        if (typingNow.current || audioNow.current) publish.current?.(false);
        publish.current = null;
        typingNow.current = false;
        clearTimeout(stopTimer.current);
        for (const { timer } of participants.values()) window.clearTimeout(timer);
        const closing = channel.unsubscribe(1000).finally(() => {
          channel.teardown();
          if (closingTopics.get(topic) === closing) closingTopics.delete(topic);
        });
        closingTopics.set(topic, closing);
      };
    }
    const closing = closingTopics.get(topic);
    if (closing) void closing.then(connect, connect);
    else connect();

    return () => {
      disposed = true;
      disconnect?.();
    };
  }, [client, isGroup, target.id, topic, userId]);

  useEffect(() => {
    const wasAudio = audioNow.current;
    audioNow.current = audioActive;
    if (!audioActive) {
      if (wasAudio) publish.current?.(typingNow.current);
      return;
    }
    const signalAudio = () => publish.current?.(true, "audio");
    signalAudio();
    const timer = window.setInterval(signalAudio, 750);
    return () => window.clearInterval(timer);
  }, [audioActive]);

  const stopTyping = useCallback(() => {
    window.clearTimeout(stopTimer.current);
    if (typingNow.current && !audioNow.current) publish.current?.(false);
    typingNow.current = false;
  }, []);

  function reportTyping(hasText: boolean) {
    if (!hasText) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (!audioNow.current && (!typingNow.current || now - lastSent.current >= 450)) {
      publish.current?.(true);
      lastSent.current = now;
    }
    typingNow.current = true;
    window.clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(stopTyping, 1150);
  }

  return { activity, reportTyping, stopTyping };
}
