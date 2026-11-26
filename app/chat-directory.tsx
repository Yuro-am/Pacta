"use client";

import { useEffect, useState } from "react";
import type { Conversation } from "../lib/inbox";
import type { Person, SocialGroup } from "../lib/social";
import type { createClient } from "../utils/supabase/client";
import { MessageList } from "./inbox";

type GroupMessage = { id: string; sender_id: string; body: string; created_at: string };

export function ChatDirectory({ client, userId, conversations, friends, groups, refreshKey, openFriend, openGroup }: {
  client: NonNullable<ReturnType<typeof createClient>>;
  userId: string;
  conversations: Conversation[];
  friends: Person[];
  groups: SocialGroup[];
  refreshKey: number;
  openFriend: (friend: Person) => void;
  openGroup: (group: SocialGroup) => void;
}) {
  const [latest, setLatest] = useState<Record<string, GroupMessage | null>>({});
  const groupIds = groups.map((group) => group.id).sort().join(",");

  useEffect(() => {
    if (!groupIds) return;
    const ids = groupIds.split(",");
    const controller = new AbortController();
    let loading = false;
    let queued = false;

    async function refresh() {
      if (controller.signal.aborted || document.hidden) return;
      if (loading) {
        queued = true;
        return;
      }
      loading = true;
      try {
        const results = await Promise.all(ids.map(async (id) => {
          const { data, error } = await client.from("pacta_group_messages")
            .select("id,sender_id,body,created_at")
            .eq("group_id", id)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(1)
            .abortSignal(controller.signal);
          return { id, message: error ? undefined : data?.[0] ?? null };
        }));
        if (controller.signal.aborted) return;
        setLatest((previous) => {
          const changed = results.filter(({ id, message }) => message !== undefined && message?.id !== previous[id]?.id);
          if (!changed.length) return previous;
          const next = { ...previous };
          for (const { id, message } of changed) next[id] = message ?? null;
          return next;
        });
      } catch {
        // Keep the visible previews during temporary network failures.
      } finally {
        loading = false;
        if (queued) {
          queued = false;
          void refresh();
        }
      }
    }

    void refresh();
    const channel = client.channel(`pacta-group-recent-${crypto.randomUUID()}`);
    for (const id of ids) channel.on("postgres_changes", {
      schema: "public", table: "pacta_group_messages", event: "INSERT", filter: `group_id=eq.${id}`,
    }, refresh);
    channel.subscribe();
    const timer = window.setInterval(refresh, 12000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      void client.removeChannel(channel);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [client, groupIds, refreshKey, userId]);

  const known = new Set(conversations.map(({ id }) => id));
  const individualChats = [...conversations, ...friends.filter(({ id }) => !known.has(id))
    .sort((left, right) => left.name.localeCompare(right.name, "es"))
    .map((friend) => ({ ...friend, body: "", created_at: "", mine: false, unread_count: 0 }))];

  const groupChats = groups.map<Conversation>((group) => {
    const message = latest[group.id];
    const mine = message?.sender_id === userId;
    const sender = group.members.find((member) => member.id === message?.sender_id)?.name;
    return {
      id: group.id,
      name: group.name,
      kind: "group",
      body: message ? (!mine && sender ? `${sender}: ${message.body}` : message.body) : "",
      created_at: message?.created_at ?? "",
      mine,
      unread_count: 0,
    };
  }).sort((left, right) => right.created_at.localeCompare(left.created_at) || left.name.localeCompare(right.name, "es"));

  return <>
    <section className="chat-directory-section">
      <h3>Individuales</h3>
      <MessageList conversations={individualChats} onOpen={openFriend} empty="Aún no tienes chats individuales." />
    </section>
    <section className="chat-directory-section">
      <h3>Grupos</h3>
      <MessageList conversations={groupChats} empty="Aún no tienes chats de grupo." onOpen={(conversation) => {
        const group = groups.find((item) => item.id === conversation.id);
        if (group) openGroup(group);
      }} />
    </section>
  </>;
}
