import type { Person } from "./social";

export type Conversation = Person & {
  body: string;
  created_at: string;
  mine: boolean;
  unread_count: number;
};

export type DebtNotice = {
  id: string;
  debt_id: string;
  kind: "new" | "joined" | "proposal" | "accepted" | "rejected" | "settled";
  title: string;
  name: string;
  created_at: string;
  unread: boolean;
};

export type InboxData = {
  conversations: Conversation[];
  notices: DebtNotice[];
  unread_messages: number;
  unread_debts: number;
};
