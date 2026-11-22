import type { createClient } from "../utils/supabase/client";

export function watchSharedDebts(
  client: NonNullable<ReturnType<typeof createClient>>,
  userId: string,
  onChange: () => void,
) {
  const table = { schema: "public", table: "shared_debts" };
  const owner = { ...table, filter: `owner_id=eq.${userId}` };
  const guest = { ...table, filter: `guest_id=eq.${userId}` };
  const channel = client.channel(`pacta-debts-${crypto.randomUUID()}`)
    .on("postgres_changes", { ...owner, event: "INSERT" }, onChange)
    .on("postgres_changes", { ...guest, event: "INSERT" }, onChange)
    .on("postgres_changes", { ...owner, event: "UPDATE" }, onChange)
    .on("postgres_changes", { ...guest, event: "UPDATE" }, onChange)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onChange();
    });

  return () => { void client.removeChannel(channel); };
}
