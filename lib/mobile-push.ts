import type { createClient } from "../utils/supabase/client";

export async function disableMobilePush(client: NonNullable<ReturnType<typeof createClient>>) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.getRegistration("/pacta-push.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const { error } = await client.from("pacta_push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  const unregistered = await subscription.unsubscribe().catch(() => false);
  if (error && !unregistered) throw error;
}
