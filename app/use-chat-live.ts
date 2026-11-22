"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatTarget } from "../lib/social";
import type { createClient } from "../utils/supabase/client";

const closingTopics = new Map<string, Promise<unknown>>();

type Client = NonNullable<ReturnType<typeof createClient>>;

export function useChatLive(client: Client, userId: string, target: ChatTarget, onMessage: () => void) {
  const [typing, setTyping] = useState(false);
  const publish = useRef<((active: boolean) => void) | null>(null);
  const stopTimer = useRef<number | undefined>(undefined);
  const lastSent = useRef(0);
  const typingNow = useRef(false);
  const topic = target.kind === "group"
    ? `pacta-chat-group:${target.id}`
    : `pacta-chat-friend:${[userId, target.id].sort().join(":")}`;
  const isGroup = target.kind === "group";

  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  useEffect(() => {
    let disposed = false;
    let disconnect: (() => void) | undefined;
    setTyping(false);

    function connect() {
      if (disposed) return;
      const session = crypto.randomUUID();
      const typists = new Map<string, number>();
      let joined = false;
      const channel = client.channel(topic, { config: { private: true } })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          if (disposed) return;
          const key = payload?.key;
          if (typeof key !== "string" || key === session || key.length !== 36) return;
          clearTimeout(typists.get(key));
          if (payload.active === true) {
            typists.set(key, window.setTimeout(() => {
              typists.delete(key);
              setTyping(typists.size > 0);
            }, 2600));
          } else {
            typists.delete(key);
          }
          setTyping(typists.size > 0);
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

      publish.current = (active) => {
        if (joined) void channel.send({ type: "broadcast", event: "typing", payload: { key: session, active } });
      };

      disconnect = () => {
        if (typingNow.current) publish.current?.(false);
        publish.current = null;
        typingNow.current = false;
        clearTimeout(stopTimer.current);
        for (const timer of typists.values()) window.clearTimeout(timer);
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

  const stopTyping = useCallback(() => {
    window.clearTimeout(stopTimer.current);
    if (typingNow.current) publish.current?.(false);
    typingNow.current = false;
  }, []);

  function reportTyping(hasText: boolean) {
    if (!hasText) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (!typingNow.current || now - lastSent.current >= 450) {
      publish.current?.(true);
      lastSent.current = now;
    }
    typingNow.current = true;
    window.clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(stopTyping, 1150);
  }

  return { typing, reportTyping, stopTyping };
}
