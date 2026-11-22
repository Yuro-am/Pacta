import type { Debt, Method, Stage } from "./demo";

export type SharedDebtRow = {
  id: string;
  invite_token: string;
  created_at: string;
  owner_id: string;
  guest_id: string | null;
  owner_name: string;
  guest_name: string;
  owner_owes: boolean;
  title: string;
  amount_cents: number;
  stage: Stage;
  proposer_id: string | null;
  method: Method | null;
  detail: string | null;
};

export function describeSharedDebt(row: SharedDebtRow, userId: string): Debt {
  const isOwner = row.owner_id === userId;
  return {
    id: row.id,
    title: row.title,
    friend: isOwner ? row.guest_name : row.owner_name,
    amount: row.amount_cents / 100,
    direction: isOwner === row.owner_owes ? "owe" : "owed",
    stage: row.stage,
    date: new Date(row.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
    group: "",
    kind: "other",
    offer: row.method && row.detail ? { method: row.method, detail: row.detail } : undefined,
    shared: {
      waiting: !row.guest_id,
      invite: isOwner && !row.guest_id ? row.invite_token : undefined,
      canRespond: row.proposer_id !== userId,
    },
  };
}

export function invitationUrl(token: string, currentOrigin: string) {
  const url = new URL("/", process.env.NEXT_PUBLIC_PACTA_URL || currentOrigin);
  url.searchParams.set("invite", token);
  return url;
}
