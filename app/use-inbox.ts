"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { InboxData } from "../lib/inbox";
import type { createClient } from "../utils/supabase/client";

export function useInbox(client: ReturnType<typeof createClient>, userId?: string) {
  const [result, setResult] = useState<{ actor: string; inbox?: InboxData; signature?: string } | null>(null);
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!client || !userId) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const { data, error } = await client.rpc("pacta_inbox").abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      if (error) {
        setResult((previous) => previous?.actor === userId ? previous : { actor: userId });
        return;
      }
      const signature = JSON.stringify(data);
      setResult((previous) => previous?.actor === userId && previous.signature === signature
        ? previous : { actor: userId, inbox: data, signature });
    } catch {
      if (!controller.signal.aborted) setResult((previous) => previous?.actor === userId ? previous : { actor: userId });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [client, userId]);

  useEffect(() => {
    if (!client || !userId) return;
    function check() {
      if (!document.hidden && !request.current) void refresh();
    }
    check();
    const timer = window.setInterval(check, 8000);
    document.addEventListener("visibilitychange", check);
    return () => {
      request.current?.abort();
      request.current = null;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [client, userId, refresh]);

  return { inbox: result?.actor === userId ? result?.inbox : undefined, refresh };
}
