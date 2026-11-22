"use client";

import { ChevronRight, MessageCircle, ReceiptText, UsersRound } from "lucide-react";
import type { Conversation, DebtNotice } from "../lib/inbox";

const clock = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });
const date = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });
const titles: Record<DebtNotice["kind"], string> = {
  new: "registró una deuda contigo",
  joined: "aceptó tu invitación",
  proposal: "envió una propuesta",
  accepted: "aceptó la propuesta",
  rejected: "rechazó la propuesta",
  settled: "confirmó que la deuda está saldada",
};

function timestamp(value: string) {
  const when = new Date(value);
  return when.toDateString() === new Date().toDateString() ? clock.format(when) : date.format(when);
}

export function MessageList({ conversations, onOpen }: {
  conversations: Conversation[];
  onOpen: (conversation: Conversation) => void;
}) {
  return <div className="debt-list">{conversations.length ? conversations.map((item) =>
    <button key={`${item.kind ?? "friend"}:${item.id}`} className={`debt-row inbox-row${item.unread_count ? " inbox-unread" : ""}`} onClick={() => onOpen(item)}>
      <span className="tile lilac">{item.kind === "group" ? <UsersRound size={19} /> : <MessageCircle size={19} />}</span>
      <span className="row-copy"><strong>{item.name}</strong><small>{item.mine && "Tú: "}{item.body}</small></span>
      <span className="inbox-meta"><time dateTime={item.created_at}>{timestamp(item.created_at)}</time>
        {item.unread_count > 0 && <span className="inbox-count" aria-label={`${item.unread_count} mensajes sin leer`}>{item.unread_count > 99 ? "99+" : item.unread_count}</span>}
      </span>
      <ChevronRight className="row-chevron" size={16} />
    </button>
  ) : <p className="empty">Aún no tienes conversaciones. Puedes empezar un chat desde Grupos → Mis amigos.</p>}</div>;
}

export function DebtNoticeList({ notices, onOpen }: {
  notices: DebtNotice[];
  onOpen: (notice: DebtNotice) => void;
}) {
  return <div className="debt-list">{notices.map((item) =>
    <button key={item.id} className={`debt-row inbox-row${item.unread ? " inbox-unread" : ""}`} onClick={() => onOpen(item)}>
      <span className="tile mint"><ReceiptText size={19} /></span>
      <span className="row-copy"><strong>{item.title}</strong><small>{item.name} {titles[item.kind]}</small></span>
      <span className="inbox-meta"><time dateTime={item.created_at}>{timestamp(item.created_at)}</time>
        {item.unread && <span className="inbox-dot" aria-label="Sin leer" />}
      </span>
      <ChevronRight className="row-chevron" size={16} />
    </button>
  )}</div>;
}
