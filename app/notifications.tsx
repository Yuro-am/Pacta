"use client";

import { Bell, Check, ChevronRight, UserRoundPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { euros, type Debt } from "../lib/demo";
import type { Conversation, DebtNotice } from "../lib/inbox";
import { DebtNoticeList, MessageList } from "./inbox";

type Props = {
  deviceSettings?: ReactNode;
  pending: number;
  requests: number;
  proposals: Debt[];
  messages: Conversation[];
  notices: DebtNotice[];
  openChat: (conversation: Conversation) => void;
  openDebt: (notice: DebtNotice) => void;
  openProposal: (debt: Debt) => void;
  openRequests: () => void;
  markRead: (notices: DebtNotice[]) => Promise<void>;
};

export function Notifications({ deviceSettings, pending, requests, proposals, messages, notices, openChat, openDebt, openProposal, openRequests, markRead }: Props) {
  const [pendingOnly, setPendingOnly] = useState(pending > 0);
  const [marking, setMarking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const visibleNotices = pendingOnly ? notices.filter((notice) => notice.unread) : notices;
  const unreadNotices = visibleNotices.filter((notice) => notice.unread);
  const hasItems = requests > 0 || proposals.length > 0 || messages.length > 0 || visibleNotices.length > 0;

  async function markVisible() {
    setMarking(true);
    setFeedback("");
    try {
      await markRead(unreadNotices);
      setFeedback("Avisos de deudas marcados como leídos.");
    } catch {
      setFeedback("No se pudieron marcar todos los avisos. Inténtalo de nuevo.");
    } finally {
      setMarking(false);
    }
  }

  return <>
    <h2 id="dialog-title">Notificaciones</h2>
    {deviceSettings}
    <div className="filters notification-filters" aria-label="Filtrar notificaciones">
      <button aria-pressed={pendingOnly} className={pendingOnly ? "filter-active" : ""} onClick={() => setPendingOnly(true)}>
        Pendientes {pending > 0 && <span className="inbox-count">{pending > 99 ? "99+" : pending}</span>}
      </button>
      <button aria-pressed={!pendingOnly} className={!pendingOnly ? "filter-active" : ""} onClick={() => setPendingOnly(false)}>Todas</button>
    </div>

    {(requests > 0 || proposals.length > 0) && <section className="notification-section">
      <h3>Por responder</h3>
      <div className="debt-list">
        {requests > 0 && <button className="debt-row inbox-row" onClick={openRequests}>
          <span className="tile lilac"><UserRoundPlus size={19} /></span>
          <span className="row-copy"><strong>Solicitudes e invitaciones</strong>
            <small>{requests === 1 ? "1 pendiente de respuesta" : `${requests} pendientes de respuesta`}</small></span>
          <ChevronRight className="row-chevron" size={16} />
        </button>}
        {proposals.map((debt) => <button key={debt.id} className="debt-row inbox-row" onClick={() => openProposal(debt)}>
          <span className="tile sand"><Bell size={19} /></span>
          <span className="row-copy"><strong>{debt.title}</strong><small>Propuesta de {debt.friend}{debt.offer ? ` · ${debt.offer.method}` : ""}</small></span>
          <span className="row-value">{euros(debt.amount)}</span>
          <ChevronRight className="row-chevron" size={16} />
        </button>)}
      </div>
    </section>}

    {messages.length > 0 && <section className="notification-section">
      <h3>Mensajes nuevos</h3>
      <MessageList conversations={messages.map((item) => item.mine ? {
        ...item, mine: false, body: item.unread_count === 1 ? "1 mensaje sin leer" : `${item.unread_count} mensajes sin leer`,
      } : item)} onOpen={openChat} />
    </section>}

    {visibleNotices.length > 0 && <section className="notification-section">
      <div className="section-heading notification-section-heading">
        <h3>Actividad de deudas</h3>
        {unreadNotices.length > 0 && <button disabled={marking} onClick={markVisible}>
          <Check size={15} /> {marking ? "Guardando…" : "Marcar como leídos"}
        </button>}
      </div>
      <DebtNoticeList notices={visibleNotices} onOpen={openDebt} />
    </section>}
    {feedback && <p role="status" className="dialog-description">{feedback}</p>}
    {!hasItems && <p className="empty notification-empty">{pendingOnly ? "Estás al día. No tienes avisos pendientes." : "Aquí aparecerán tus mensajes nuevos, solicitudes y avisos de deudas."}</p>}
  </>;
}
