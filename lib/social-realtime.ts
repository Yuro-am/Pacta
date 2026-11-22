import type { createClient } from "../utils/supabase/client";

export function watchUserActivity(client: NonNullable<ReturnType<typeof createClient>>, userId: string, {
  messages, requests,
}: { messages: () => void; requests: () => void }) {
  const channel = client.channel(`pacta-activity-${crypto.randomUUID()}`)
    .on("postgres_changes", {
      schema: "public", table: "pacta_messages", event: "INSERT", filter: `recipient_id=eq.${userId}`,
    }, messages)
    .on("postgres_changes", {
      schema: "public", table: "pacta_friendships", event: "INSERT", filter: `recipient=eq.${userId}`,
    }, requests)
    .on("postgres_changes", {
      schema: "public", table: "pacta_friendships", event: "UPDATE", filter: `requester=eq.${userId}`,
    }, requests)
    .on("postgres_changes", {
      schema: "public", table: "pacta_group_members", event: "INSERT", filter: `user_id=eq.${userId}`,
    }, requests)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        messages();
        requests();
      }
    });

  return () => { void client.removeChannel(channel); };
}
