"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { disableMobilePush } from "../lib/mobile-push";
import type { createClient } from "../utils/supabase/client";

const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function MobilePush({ client, userId }: {
  client: NonNullable<ReturnType<typeof createClient>>;
  userId: string;
}) {
  const [available, setAvailable] = useState(false);
  const [installedRequired, setInstalledRequired] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setAvailable(supported);
    setInstalledRequired(!supported && (/iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)));
    if (!supported || !key) return;
    let current = true;
    async function check() {
      if (Notification.permission === "denied") return;
      await navigator.serviceWorker.register("/pacta-push.js");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription || Notification.permission !== "granted") return;
      const { data } = await client.from("pacta_push_subscriptions")
        .select("endpoint").eq("user_id", userId).eq("endpoint", subscription.endpoint).maybeSingle();
      if (current) setEnabled(Boolean(data));
    }
    void check().catch(() => undefined);
    return () => { current = false; };
  }, [client, userId]);

  async function toggle() {
    if (!key || busy) return;
    setBusy(true);
    setFeedback("");
    try {
      if (enabled) {
        await disableMobilePush(client);
        setEnabled(false);
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setFeedback("Puedes permitir los avisos de PACTA en los ajustes de notificaciones del navegador o del móvil.");
          return;
        }
        await navigator.serviceWorker.register("/pacta-push.js");
        const registration = await navigator.serviceWorker.ready;
        const encoded = key.replace(/-/g, "+").replace(/_/g, "/");
        const applicationServerKey = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
        const existing = await registration.pushManager.getSubscription();
        let subscription = existing;
        const existingKey = existing?.options.applicationServerKey;
        if (existing && (!existingKey || existingKey.byteLength !== applicationServerKey.byteLength
          || new Uint8Array(existingKey).some((value, index) => value !== applicationServerKey[index]))) {
          await disableMobilePush(client);
          subscription = null;
        }
        subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        const { endpoint, keys } = subscription.toJSON();
        if (!endpoint || !keys) throw new Error("Incomplete browser subscription");
        const { error } = await client.rpc("pacta_enable_mobile_push", {
          p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth,
        });
        if (error?.code === "PGRST202" || error?.message === "Push configuration unavailable") {
          setFeedback("Los avisos todavía necesitan configurarse en Supabase.");
          return;
        }
        if (error) throw error;
        setEnabled(true);
      }
    } catch {
      setFeedback("No se pudo cambiar la configuración de avisos. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (!key) return null;
  return <section className="notification-section">
    <h3>Avisos en este dispositivo</h3>
    {available ? <button className="secondary" disabled={busy} onClick={() => void toggle()}>
      <BellRing size={17} /> {busy ? "Guardando…" : enabled ? "Desactivar avisos" : "Activar avisos"}
    </button> : <p className="dialog-description">{installedRequired
      ? "En Safari, toca Compartir → Añadir a pantalla de inicio. Abre PACTA desde su icono para activar los avisos. Requiere iOS o iPadOS 16.4 o posterior."
      : "Este navegador no permite recibir avisos de PACTA."}</p>}
    {feedback && <p role="status" className="dialog-description">{feedback}</p>}
  </section>;
}
