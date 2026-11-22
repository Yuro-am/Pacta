"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronRight,
  CircleHelp, Coffee, Gift, HandHeart, Handshake, House, LayoutGrid, List, Pizza,
  Plane, Plus, ReceiptText, Send, Sparkles, UsersRound, Wallet, X,
} from "lucide-react";
import { euros, groups, type Debt, type Method } from "../lib/demo";

import { describeSharedDebt, invitationUrl, type SharedDebtRow } from "../lib/shared-debts";
import type { DebtNotice } from "../lib/inbox";
import type { Person, SocialData } from "../lib/social";
import { DebtNoticeList, MessageList } from "./inbox";
import { useInbox } from "./use-inbox";
import { ChatDialog } from "./chat";
import { GroupBalances } from "./group-balances";
import { GroupInvite, SocialPanel } from "./social";
import { AppearancePicker, useAppearance } from "./appearance";
import { NewDebtForm, type GroupSplit } from "./new-debt";
import { ProfileDialog, useProfile } from "./profile";

const nav = [
  { label: "Inicio", icon: LayoutGrid },
  { label: "Grupos", icon: UsersRound },
  { label: "Actividad", icon: ReceiptText },
] as const;
type View = typeof nav[number]["label"];
const methods: { name: Method; icon: typeof Wallet }[] = [
  { name: "Dinero", icon: Wallet }, { name: "Comida", icon: Pizza },
  { name: "Bebida", icon: Coffee }, { name: "Favor", icon: HandHeart },
  { name: "Recompensa", icon: Gift },
];
const kindIcons = { food: Pizza, trip: Plane, drink: Coffee, other: ReceiptText };
const groupIcons = { pizza: Pizza, plane: Plane, house: House };
const kindColors = { food: "peach", trip: "lilac", drink: "mint", other: "sand" };
const firstAccessKey = "pacta-first-access-v1";
const avatars = ["#e8dcff", "#ffdfcf", "#dcf2e7", "#ffdced"];

export default function Home() {
  const [view, setView] = useState<View>("Inicio");
  const [localDebts, setLocalDebts] = useState<Debt[]>([]);
  const [shared, setShared] = useState<{ actor: string; debts: Debt[] } | null>(null);
  const [socialState, setSocialState] = useState<{ actor: string; data: SocialData } | null>(null);
  const [socialUnavailableFor, setSocialUnavailableFor] = useState<string | null>(null);
  const socialRevision = useRef(0);
  const socialActionInProgress = useRef(false);
  const sharedRevision = useRef(0);
  const [sharedError, setSharedError] = useState<{ actor: string; missing: boolean } | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [dialog, setDialog] = useState<"new" | "welcome" | "notifications" | "profile" | "invite" | "register" | "messages" | "access" | null>(null);
  const checkedFirstAccess = useRef(false);
  const messageArea = useRef<HTMLDivElement>(null);
  const messageButton = useRef<HTMLButtonElement>(null);
  const [chatFriend, setChatFriend] = useState<Person | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [filter, setFilter] = useState<"Todo" | "Pendientes" | "Saldadas">("Todo");
  const [message, setMessage] = useState("");
  const profile = useProfile();
  const appearance = useAppearance();
  const { client } = profile;
  const userId = profile.user?.id;
  const { inbox, refresh: refreshInbox } = useInbox(client, userId);

  useEffect(() => {
    if (dialog !== "messages") return;
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !messageArea.current?.contains(event.target)) setDialog(null);
    }
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setDialog(null);
      messageButton.current?.focus();
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [dialog]);
  useEffect(() => { setChatFriend(null); }, [userId]);
  const sharedUnavailable = sharedError?.actor === userId && sharedError?.missing;
  const usingShared = Boolean(userId && !sharedUnavailable);
  const social = socialState?.actor === userId ? socialState?.data : undefined;
  const realGroup = social?.groups.find((item) => item.id === group && item.accepted);
  const groupName = realGroup?.name ?? (!userId ? groups.find((item) => item.name === group)?.name : undefined);
  const friendsForDebt = social?.friends.filter((friend) => friend.accepted) ?? [];
  const groupsForDebt = social?.groups.filter((item) => item.accepted) ?? [];
  const debts = usingShared ? (shared?.actor === userId ? shared?.debts ?? [] : []) : localDebts;
  const firstName = profile.name.split(/\s+/, 1)[0];
  const initial = Array.from(profile.name)[0]?.toLocaleUpperCase("es");
  const active = debts.find((debt) => debt.id === selected);
  const pendingSocial = (social?.friends.filter((friend) => friend.incoming && !friend.accepted).length ?? 0)
    + (social?.groups.filter((item) => !item.accepted).length ?? 0);
  const proposals = debts.filter((debt) => debt.stage === "Propuesta" && (!debt.shared || debt.shared.canRespond)
    && !inbox?.notices.some((notice) => notice.kind === "proposal" && notice.debt_id === debt.id));
  const unread = (inbox?.unread_messages ?? 0) + (inbox?.unread_debts ?? 0) + proposals.length + pendingSocial;
  const owed = debts.reduce((sum, debt) => sum + (debt.stage !== "Saldada" && debt.direction === "owed" ? Math.round(debt.amount * 100) : 0), 0) / 100;
  const owe = debts.reduce((sum, debt) => sum + (debt.stage !== "Saldada" && debt.direction === "owe" ? Math.round(debt.amount * 100) : 0), 0) / 100;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("pacta-debts-v1");
      if (saved) {
        const items: Debt[] = JSON.parse(saved);
        setLocalDebts(items.filter((debt) => !["1", "2", "3", "4", "5"].includes(debt.id)));
      }
    } catch { /* Fall back to demo data if storage is unavailable. */ }
    setReady(true);
    const url = new URL(window.location.href);
    const incoming = url.searchParams.get("invite");
    let hasPendingInvitation = false;
    try {
      if (incoming && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(incoming)) {
        setInvite(incoming);
        localStorage.setItem("pacta-invitation", incoming);
        url.searchParams.delete("invite");
      } else {
        const pending = localStorage.getItem("pacta-invitation");
        hasPendingInvitation = Boolean(pending);
        setInvite(pending);
      }
    } catch { /* An open invitation remains available in memory. */ }

    if (incoming || hasPendingInvitation) setDialog("invite");
    const auth = url.searchParams.get("auth");
    if (auth === "confirmed" || auth === "failed") {
      setMessage(auth === "confirmed"
        ? "Correo confirmado. Tu sesión está iniciada."
        : "El enlace no pudo confirmarse. Abre el correo en el navegador donde te registraste y comprueba si ha caducado.");
      url.searchParams.delete("auth");
    }
    window.history.replaceState(window.history.state, "", url);
  }, []);

  useEffect(() => {
    if (!ready || profile.loading || !client || checkedFirstAccess.current) return;
    checkedFirstAccess.current = true;
    try {
      if (localStorage.getItem(firstAccessKey)) return;
      localStorage.setItem(firstAccessKey, "1");
    } catch { /* The menu can still open when storage is unavailable. */ }
    if (!userId) setDialog((current) => current ?? "access");
  }, [client, ready, profile.loading, userId]);

  useEffect(() => {
    if (ready) {
      try { localStorage.setItem("pacta-debts-v1", JSON.stringify(localDebts)); }
      catch { /* The demo remains usable in memory. */ }
    }
  }, [localDebts, ready]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3200);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!client || !userId) return;
    let active = true;
    let inFlight = false;
    const controller = new AbortController();

    async function refresh() {
      if (!client || !userId || inFlight || document.hidden) return;
      inFlight = true;
      const revision = ++sharedRevision.current;
      const { data, error } = await client.from("shared_debts").select("*")
        .order("created_at", { ascending: false }).abortSignal(controller.signal);
      inFlight = false;
      if (!active || revision !== sharedRevision.current) return;
      setSharedError(error ? { actor: userId, missing: ["42P01", "PGRST205"].includes(error.code) } : null);
      if (data) {
        setShared({ actor: userId, debts: (data as SharedDebtRow[]).map((row) => describeSharedDebt(row, userId)) });
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [client, userId]);

  const refreshSocial = useCallback(async () => {
    if (!client || !userId) return;
    const revision = ++socialRevision.current;
    const { data, error } = await client.rpc("pacta_social");
    if (revision !== socialRevision.current) return;
    if (data && !error) {
      setSocialState({ actor: userId, data });
      setSocialUnavailableFor(null);
    } else {
      setSocialUnavailableFor(userId);
    }
  }, [client, userId]);

  useEffect(() => {
    if (!userId) return;
    void refreshSocial();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshSocial();
    }, 20000);
    return () => {
      socialRevision.current++;
      window.clearInterval(timer);
    };
  }, [userId, refreshSocial]);

  async function runSocialAction(name: string, args: Record<string, string>) {
    if (!client || !userId || socialActionInProgress.current) return false;
    socialActionInProgress.current = true;
    try {
      const { error } = await client.rpc(name, args);
      if (error) throw error;
      await refreshSocial();
      setMessage(name === "pacta_request_friend" ? "Si el usuario existe, recibirá tu solicitud."
        : name === "pacta_group_member" && args.p_action === "invite" ? "Invitación guardada."
        : "Cambios guardados.");
      return true;
    } catch {
      setMessage("No se pudo completar. Comprueba los datos e inténtalo otra vez.");
      return false;
    } finally {
      socialActionInProgress.current = false;
    }
  }

  function openChat(friend: Person) {
    setDialog(null);
    setSelected(null);
    setChatFriend(friend);
  }

  async function openDebtNotice(notice: DebtNotice) {
    if (!client || !userId || busy) return;
    let debt = debts.find((item) => item.id === notice.debt_id);
    if (!debt) {
      setBusy(true);
      try {
        const { data, error } = await client.from("shared_debts").select("*").eq("id", notice.debt_id).single();
        if (error || !data) {
          setMessage("No se pudo abrir esa deuda. Inténtalo de nuevo.");
          return;
        }
        debt = describeSharedDebt(data, userId);
        storeSharedDebt(data, userId);
      } finally {
        setBusy(false);
      }
    }
    setDialog(null);
    setSelected(debt.id);
    if (notice.unread) {
      await client.rpc("pacta_read_debt_notice", { p_notice: notice.id });
      void refreshInbox();
    }
  }

  function storeSharedDebt(row: SharedDebtRow, actor: string) {
    const debt = describeSharedDebt(row, actor);
    sharedRevision.current++;
    setShared((previous) => ({
      actor,
      debts: [debt, ...(previous?.actor === actor ? previous.debts : []).filter((item) => item.id !== debt.id)],
    }));
  }

  async function joinInvitation() {
    if (!client || !userId || !invite || busy) return;
    setBusy(true);
    setInviteError("");
    try {
      const { data: id, error } = await client.rpc("pacta_join_debt", { p_token: invite });
      if (error) throw error;
      const { data, error: readError } = await client.from("shared_debts").select("*").eq("id", id).single();
      if (readError) throw readError;
      storeSharedDebt(data, userId);
      setInvite(null);
      setDialog(null);
      navigate("Actividad");
      setSelected(id);
      try { localStorage.removeItem("pacta-invitation"); } catch {}
    } catch {
      setInviteError("No se pudo abrir la deuda. El enlace puede haber caducado, haberse usado o no estar disponible.");
    } finally {
      setBusy(false);
    }
  }

  async function shareInvitation(token: string) {
    const link = invitationUrl(token, window.location.origin);
    try {
      if (navigator.share) await navigator.share({ title: "Invitación de PACTA", url: link.href });
      else {
        await navigator.clipboard.writeText(link.href);
        setMessage("Enlace copiado. Ya puedes enviárselo a tu amigo.");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage("Mantén pulsado el enlace para copiarlo.");
      }
    }
  }

  function navigate(next: View) {
    setView(next);
    setGroup(null);
    setFilter("Todo");
    if (next === "Grupos") void refreshSocial();
  }

  async function addDebt(form: FormData, split?: GroupSplit) {
    if (busy || profile.loading) return "Espera a que termine la operación actual.";
    const title = String(form.get("title")).trim();
    const friend = String(form.get("friend") ?? "").trim();
    const friendId = String(form.get("friendId") ?? "");
    const onlineFriend = usingShared && friendId;
    const amount = Number(form.get("amount"));
    const direction = form.get("direction") === "owed" ? "owed" : "owe";
    if (!title || !Number.isFinite(amount) || amount < 0.01 || amount > 999999) return "Introduce un concepto y un importe válido.";
    if (!split && !friend && !onlineFriend) return "Selecciona un amigo o escribe su nombre.";
    if (split && (!usingShared || !userId || !client)) return "Inicia sesión para repartir entre los miembros del grupo.";

    if (usingShared && userId && client) {
      setBusy(true);
      try {
        const values = { p_title: title, p_owner_owes: direction === "owe", p_cents: Math.round(amount * 100) };
        if (split) {
          const batch = { p_title: title, p_owner_owes: values.p_owner_owes,
            p_group: split.groupId, p_members: split.members, p_split_id: split.id };
          const { data, error } = split.amounts
            ? await client.rpc("pacta_split_group_debt_custom", { ...batch, p_amounts: split.amounts })
            : await client.rpc("pacta_split_group_debt", { ...batch, p_cents: values.p_cents, p_include_self: split.includeSelf });
          if (error?.code === "PGRST202") return split.amounts
            ? "El reparto manual aún no está activado en Supabase."
            : "El reparto por grupos aún no está activado en Supabase.";
          if (error?.message === "Group members changed") {
            void refreshSocial();
            return "Han cambiado los miembros del grupo. Revisa el reparto actualizado antes de guardarlo.";
          }
          if (error) throw error;
          for (const row of data as SharedDebtRow[]) storeSharedDebt(row, userId);
          setDialog(null);
          showGroup(split.groupId);
          setMessage("Reparto registrado para el grupo");
          return;
        }

        const friendGroup = realGroup?.members.some((member) => member.id === friendId) ? realGroup.id : null;
        const { data, error } = onlineFriend
          ? await client.rpc("pacta_create_friend_debt", { ...values, p_friend: friendId, p_group: friendGroup })
          : await client.rpc("pacta_create_debt", { ...values, p_guest: friend });
        if (error) throw error;
        storeSharedDebt(data, userId);
        setSelected(data.id);
      } catch {
        return "No se pudo guardar la deuda compartida. Inténtalo de nuevo.";
      } finally {
        setBusy(false);
      }
    } else {
      setLocalDebts((previous) => [{
        id: crypto.randomUUID(), title, friend, amount, date: "Hoy",
        group: String(form.get("group") ?? ""), kind: "other", stage: "Pendiente", direction,
      }, ...previous]);
    }
    setDialog(null);
    navigate("Actividad");
    setMessage("Deuda registrada");
  }

  async function updateDebt(update: Partial<Debt>, notice: string) {
    if (!active || busy) return;
    if (active.shared && userId && client) {
      const actions = { Pendiente: "reject", Propuesta: "propose", Aceptada: "accept", Saldada: "settle" };
      if (!update.stage) return;
      setBusy(true);
      try {
        const { data, error } = await client.rpc("pacta_update_debt", {
          p_id: active.id, p_action: actions[update.stage],
          p_method: update.offer?.method ?? null, p_detail: update.offer?.detail ?? null,
        });
        if (error) throw error;
        storeSharedDebt(data, userId);
      } catch {
        setMessage("No se pudo actualizar la deuda. Comprueba su estado e inténtalo de nuevo.");
        return;
      } finally {
        setBusy(false);
      }
    } else {
      setLocalDebts((previous) => previous.map((debt) => debt.id === active.id ? { ...debt, ...update } : debt));
    }
    setMessage(notice);
  }

  async function deleteDebt(debt: Debt) {
    if (busy) return "Otra operación está en curso. Vuelve a intentarlo.";

    if (debt.shared) {
      if (!userId || !client || !debt.shared.invite) return "Esta deuda ya está compartida.";
      setBusy(true);
      try {
        const { data, error } = await client.from("shared_debts").delete()
          .eq("id", debt.id).select("id").maybeSingle();
        if (error?.code === "42501") return "El borrado de invitaciones aún no está activado en Supabase.";
        if (error) return "No se pudo borrar la deuda. Inténtalo de nuevo.";
        if (!data) return "No se pudo borrar. La deuda puede estar ya compartida o borrada.";
        sharedRevision.current++;
        setShared((previous) => previous?.actor === userId
          ? { ...previous, debts: previous.debts.filter((item) => item.id !== debt.id) }
          : previous);
      } catch {
        return "No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.";
      } finally {
        setBusy(false);
      }
    } else {
      setLocalDebts((previous) => previous.filter((item) => item.id !== debt.id));
    }

    setSelected((current) => current === debt.id ? null : current);
    setMessage("Deuda borrada");
  }

  function showGroup(name: string) {
    navigate("Grupos");
    setGroup(name);
  }

  const visibleDebts = debts.filter((debt) => (
    (!group || debt.group === group) &&
    (filter === "Todo" || (filter === "Saldadas" ? debt.stage === "Saldada" : debt.stage !== "Saldada"))
  ));

  function debtList(items: Debt[]) {
    return <div className="debt-list">
      {items.length ? items.map((debt) => {
        const Icon = kindIcons[debt.kind];
        return <button key={debt.id} className="debt-row" onClick={() => setSelected(debt.id)}>
          <span className={`tile ${kindColors[debt.kind]}`}><Icon size={20} /></span>
          <span className="row-copy"><strong>{debt.title}</strong><small>{debt.friend} · {(debt.shared ? social?.groups.find((item) => item.id === debt.group)?.name : debt.group) || "Sin grupo"}</small></span>
          <span className="row-value">
            <strong className={debt.stage === "Saldada" ? "muted" : debt.direction === "owed" ? "positive" : ""}>
              {debt.direction === "owed" ? "+" : "−"}{euros(debt.amount)}
            </strong>
            <small>{debt.stage === "Pendiente" ? debt.date : debt.stage}</small>
          </span>
          <ChevronRight className="row-chevron" size={16} />
        </button>;
      }) : <p className="empty">Aquí aparecerán los movimientos.</p>}
    </div>;
  }

  function groupList() {
    if (userId) {
      const members = social?.groups.filter((item) => item.accepted) ?? [];
      return <div className="group-list">{members.length ? members.map((item) => <button key={item.id} className="group-row" onClick={() => showGroup(item.id)}>
        <span className="tile lilac"><UsersRound size={21} /></span>
        <span className="row-copy"><strong>{item.name}</strong><small>{item.members.length} miembros</small></span>
        <ChevronRight className="row-chevron" size={16} />
      </button>) : <p className="empty">Aquí aparecerán los grupos que crees o aceptes.</p>}</div>;
    }
    return <div className="group-list">{groups.map((item) => {
      const Icon = groupIcons[item.symbol];
      return <button key={item.name} className="group-row" onClick={() => showGroup(item.name)}>
        <span className={`tile ${item.color}`}><Icon size={21} /></span>
        <span className="row-copy"><strong>{item.name}</strong><small>{item.members.length} miembros</small></span>
        <ChevronRight className="row-chevron" size={16} />
      </button>;
    })}</div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setDialog("welcome")} aria-label="Bienvenida a Pacta">
          <span className="brand-mark"><Handshake size={23} strokeWidth={2.1} /></span> pacta<span className="brand-dot">.</span>
        </button>
        <nav className="side-nav" aria-label="Navegación principal">
          {nav.map(({ label, icon: Icon }) =>
            <button key={label} className={view === label ? "nav-active" : ""} onClick={() => navigate(label)} aria-current={view === label ? "page" : undefined}>
              <Icon size={19} />{label}
              {label === "Grupos" && pendingSocial > 0 && <span className="group-request-count" aria-label={`${pendingSocial} solicitudes pendientes`}>{pendingSocial > 99 ? "99+" : pendingSocial}</span>}
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <AppearancePicker {...appearance} />
          <button className="help" onClick={() => setDialog("welcome")}><CircleHelp size={19} /> Sobre Pacta</button>
          <button className="profile" onClick={() => setDialog("profile")} aria-label="Mi perfil"><span className="avatar">{initial}</span><span><strong>{profile.name}</strong><small>Mi espacio personal</small></span></button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="brand mobile-brand" onClick={() => setDialog("welcome")} aria-label="Bienvenida a Pacta"><span className="brand-mark"><Handshake size={21} /></span> pacta<span className="brand-dot">.</span></button>
          <span className="top-label">Mi espacio</span>
          <div className="top-actions">
            <button className="icon-button notification" aria-label={unread ? `Notificaciones (${unread} sin leer)` : "Notificaciones"} onClick={() => {
              setDialog("notifications"); void refreshInbox();
            }}><Bell size={19} />{unread > 0 && <span className="notification-count">{unread > 99 ? "99+" : unread}</span>}</button>
            {userId && <div className="message-area" ref={messageArea}>
              <button ref={messageButton} className="icon-button notification" title="Mensajes"
                aria-label={inbox?.unread_messages ? `Mensajes (${inbox.unread_messages} sin leer)` : "Mensajes"}
                aria-expanded={dialog === "messages"} aria-controls="message-menu"
                onClick={() => {
                  setDialog(dialog === "messages" ? null : "messages");
                  if (dialog !== "messages") void refreshInbox();
                }}>
                <Send size={18} />
                {Boolean(inbox?.unread_messages) && <span className="notification-count" aria-hidden="true">
                  {(inbox?.unread_messages ?? 0) > 99 ? "99+" : inbox?.unread_messages}
                </span>}
              </button>
              {dialog === "messages" && <section id="message-menu" className="message-menu" aria-labelledby="message-menu-title">
                <div className="section-heading">
                  <h2 id="message-menu-title">Mensajes</h2>
                  <button onClick={() => { setDialog(null); navigate("Grupos"); }}>Nuevo mensaje</button>
                </div>
                <MessageList conversations={inbox?.conversations ?? []} onOpen={openChat} />
              </section>}
            </div>}
            <button className="avatar top-avatar" onClick={() => setDialog("profile")} aria-label="Mi perfil">{initial}</button>
          </div>
        </header>

        <div className="content">
          {sharedError?.actor === userId && sharedError && <p role="status" className="dialog-description">{sharedUnavailable
            ? "Las invitaciones aún no están activadas. Puedes seguir usando tus deudas locales."
            : "No se pudieron cargar las deudas compartidas."}</p>}
          {invite && dialog !== "invite" && <button className="secondary invitation-button" onClick={() => setDialog("invite")}>Abrir invitación pendiente</button>}
          {view === "Inicio" ? <>
            <div className="page-heading">
              <div><h1>¡Hola, {firstName}! <span className="wave">👋</span></h1><p>Así van vuestras cuentas entre amigos.</p></div>
              <button className="primary heading-action" onClick={() => setDialog("new")}><Plus size={19} /> Nueva deuda</button>
            </div>

            <section className="balance" aria-label="Resumen de saldo">
              <div className="balance-decoration" aria-hidden="true"><span /><span /><span /><span /></div>
              <div className="balance-label"><Wallet size={17} /> Tu balance</div>
              <div className="balance-grid">
                <div><span><ArrowDownLeft size={16} /> Te deben</span><strong>{euros(owed)}</strong></div>
                <div><span><ArrowUpRight size={16} /> Debes</span><strong>{euros(owe)}</strong></div>
              </div>
            </section>

            <div className="dashboard-grid home-dashboard">
              <section>
                <div className="section-heading"><h2>Actividad reciente</h2><button onClick={() => navigate("Actividad")}>Ver todo <ArrowRight size={15} /></button></div>
                {debtList(debts.slice(0, 4))}
              </section>
              <section>
                <div className="section-heading"><h2>Tus grupos</h2><button onClick={() => navigate("Grupos")}>Ver todos <ArrowRight size={15} /></button></div>
                {groupList()}
              </section>
            </div>
          </> : view === "Grupos" ? <>
            {group && <button className="back" onClick={() => setGroup(null)}>← Todos los grupos</button>}
            <div className="page-heading"><div><h1>{groupName ?? "Amigos y grupos"}</h1><p>{group ? "Las cuentas de vuestro grupo, en un solo lugar." : "Compartid planes y llevad las cuentas al día."}</p></div>
            <button className="primary heading-action" onClick={() => setDialog("new")}><Plus size={19} /> Nueva deuda</button></div>
            {groupName ? <>
              {realGroup && social && <GroupInvite group={realGroup} friends={social.friends} run={runSocialAction} />}
              <div className="members">{realGroup ? realGroup.members.map((member, index) =>
                <span key={member.id}><span className="avatar" style={{ background: avatars[index % avatars.length] }}>{member.name[0]}</span>{member.name}</span>
              ) : groups.find((item) => item.name === group)?.members.map((member, index) =>
                <span key={member}><span className="avatar" style={{ background: avatars[index % avatars.length] }}>{member === "Álex" ? initial : member[0]}</span>{member === "Álex" ? firstName : member}</span>
              )}</div>
              {realGroup && client && userId && <GroupBalances key={`${userId}:${realGroup.id}`}
                client={client} groupId={realGroup.id} userId={userId}
                refreshKey={visibleDebts.map((debt) => `${debt.id}:${debt.stage}`).sort().join(",")} />}
              <div className="section-heading"><h2>Movimientos del grupo</h2></div>
              {debtList(visibleDebts)}
            </> : userId ? (social ? <SocialPanel data={social} run={runSocialAction} openGroup={showGroup} openChat={openChat} />
              : <p role="status">{socialUnavailableFor === userId ? "Amigos y grupos aún no están disponibles. Comprueba la configuración de Supabase." : "Cargando amigos y grupos…"}</p>)
              : <><button className="secondary invitation-button" onClick={() => setDialog("profile")}>Inicia sesión para añadir amigos y grupos</button>
                <div className="groups-page">{groupList()}</div></>}
          </> : <>
            <div className="page-heading"><div><h1>Actividad</h1><p>Consulta tus deudas, propuestas y pagos.</p></div>
            <button className="primary heading-action" onClick={() => setDialog("new")}><Plus size={19} /> Nueva deuda</button></div>
            <div className="filters" aria-label="Filtrar actividad">{(["Todo", "Pendientes", "Saldadas"] as const).map((item) =>
              <button key={item} aria-pressed={filter === item} className={filter === item ? "filter-active" : ""} onClick={() => setFilter(item)}>{item}</button>
            )}</div>
            {debtList(visibleDebts)}
          </>}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Navegación móvil">
        <button onClick={() => navigate("Inicio")} aria-current={view === "Inicio" ? "page" : undefined} className={view === "Inicio" ? "bottom-active" : ""}><LayoutGrid size={21} /> Inicio</button>
        <button onClick={() => navigate("Grupos")} aria-current={view === "Grupos" ? "page" : undefined} className={view === "Grupos" ? "bottom-active" : ""}><UsersRound size={21} /> Grupos{pendingSocial > 0 && <span className="group-request-count" aria-label={`${pendingSocial} solicitudes pendientes`}>{pendingSocial > 99 ? "99+" : pendingSocial}</span>}</button>
        <button className="bottom-add" onClick={() => setDialog("new")}><span><Plus size={22} /></span> Añadir</button>
        <button onClick={() => navigate("Actividad")} aria-current={view === "Actividad" ? "page" : undefined} className={view === "Actividad" ? "bottom-active" : ""}><List size={22} /> Actividad</button>
      </nav>

      {((dialog && dialog !== "messages") || active || (chatFriend && client && userId)) && <Modal close={() => {
        setDialog(null); setSelected(null); setChatFriend(null);
      }}>
        {chatFriend && client && userId ? <ChatDialog key={`${userId}:${chatFriend.id}`} client={client} userId={userId} friend={chatFriend} trackRead={Boolean(inbox)} onChange={refreshInbox} />
          : dialog === "invite" ? <>
          <h2 id="dialog-title">Invitación de PACTA</h2>
          <p className="dialog-description">{!invite ? "Este enlace no es válido." : !client
            ? "La versión actual necesita conectar Supabase para abrir deudas compartidas."
            : userId ? "Acepta para ver la deuda en tu cuenta."
            : "Entra o crea una cuenta para añadir esta deuda compartida."}</p>
          {invite && client && !profile.loading && (userId
            ? <button className="primary" disabled={busy} onClick={joinInvitation}>Aceptar invitación</button>
            : <div className="dialog-actions">
              <button className="secondary" onClick={() => setDialog("profile")}>Ya tengo cuenta</button>
              <button className="primary" onClick={() => setDialog("register")}>Crear cuenta</button>
            </div>)}
          {inviteError && <p role="alert" className="dialog-description">{inviteError}</p>}
        </> : (dialog === "profile" || dialog === "register" || dialog === "access") ? <ProfileDialog
          profile={profile} appearance={<AppearancePicker {...appearance} />} initialMode={dialog === "access" ? "access" : dialog === "register" ? "register" : invite ? "login" : "profile"} /> : dialog === "welcome" ? <div className="welcome">
          <span className="brand-mark"><Handshake size={39} /></span>
          <h2 id="dialog-title">Bienvenido a PACTA<span className="brand-dot">.</span></h2>
          <p>Comparte gastos y salda cuentas a vuestra manera. Elegid entre dinero, comida, bebidas, favores y otras recompensas.</p>
          <button className="primary" onClick={() => { setDialog(null); navigate("Inicio"); }}>Entrar a Pacta <ArrowRight size={18} /></button>
        </div> : dialog === "new" ? <>
          <h2 id="dialog-title">Nueva deuda</h2><p className="dialog-description">Añade un gasto compartido o algo que quedó pendiente.</p>
          <NewDebtForm friends={friendsForDebt} onlineGroups={groupsForDebt} userId={userId}
            initialGroup={group} usingShared={usingShared} disabled={busy || profile.loading} save={addDebt} />
        </> : dialog === "notifications" ? <>
          <h2 id="dialog-title">Notificaciones</h2>
          <p className="dialog-description">Mensajes, solicitudes y cambios en tus deudas.</p>
          {Boolean(inbox?.conversations.some((item) => item.unread_count > 0)) && <section className="notification-section">
            <h3>Mensajes nuevos</h3>
            <MessageList conversations={inbox!.conversations.filter((item) => item.unread_count > 0)} onOpen={openChat} />
          </section>}
          {Boolean(inbox?.notices.length) && <section className="notification-section">
            <h3>Deudas</h3>
            <DebtNoticeList notices={inbox!.notices} onOpen={openDebtNotice} />
          </section>}
          {pendingSocial > 0 && <button className="secondary invitation-button" onClick={() => {
            setDialog(null);
            navigate("Grupos");
          }}>Ver solicitudes de amigos y grupos ({pendingSocial})</button>}
          {proposals.length > 0 && <div className="debt-list">{proposals.map((debt) =>
            <button className="debt-row" key={debt.id} onClick={() => { setDialog(null); setSelected(debt.id); }}>
              <span className="tile lilac"><Bell size={19} /></span><span className="row-copy"><strong>{debt.title}</strong><small>{debt.friend} · {debt.offer?.method}</small></span><ChevronRight size={16} />
            </button>)}</div>}
          {!unread && !inbox?.notices.length && <p className="empty">Estás al día. Los avisos aparecerán aquí.</p>}
        </> : active && <DebtDetail key={active.id} debt={active} update={updateDebt} remove={deleteDebt} busy={busy} shareInvitation={shareInvitation} />}
      </Modal>}
      <div role="status" className={message ? "toast shown" : "toast"}>{message && <><Check size={17} />{message}</>}</div>
    </div>
  );
}

function Modal({ children, close }: { children: React.ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return <dialog ref={ref}
    className="modal" aria-labelledby="dialog-title"
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="modal-content">
      <button className="icon-button close" onClick={close} aria-label="Cerrar"><X size={21} /></button>
      {children}
    </div>
  </dialog>;
}

function DebtDetail({ debt, update, remove, busy, shareInvitation }: {
  debt: Debt;
  update: (value: Partial<Debt>, notice: string) => void;
  remove: (debt: Debt) => Promise<string | undefined>;
  busy: boolean;
  shareInvitation: (token: string) => void;
}) {
  const [method, setMethod] = useState<Method>("Dinero");
  const [confirming, setConfirming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const stages = ["Propuesta", "Aceptada", "Saldada"];
  const progress = stages.indexOf(debt.stage);
  const inviteToken = debt.shared?.invite;
  const inviteUrl = inviteToken ? invitationUrl(inviteToken, window.location.origin).href : "";
  if (confirmingDelete) return <>
    <h2 id="dialog-title">¿Borrar deuda?</h2>
    <p className="dialog-description">Se eliminará «{debt.title}» de tu actividad y de tu saldo.
      {debt.shared && " El enlace de invitación dejará de funcionar."}
    </p>
    {deleteError && <p className="dialog-description" role="alert">{deleteError}</p>}
    <div className="dialog-actions">
      <button className="secondary" disabled={busy} onClick={() => { setConfirmingDelete(false); setDeleteError(""); }}>Cancelar</button>
      <button className="danger" disabled={busy} onClick={async () => {
        setDeleteError((await remove(debt)) ?? "");
      }}>{busy ? "Borrando…" : "Sí, borrar deuda"}</button>
    </div>
  </>;

  return <>
    <h2 id="dialog-title">{debt.title}</h2>
    <p className="dialog-description">{debt.direction === "owe" ? `Le debes a ${debt.friend}` : `${debt.friend} te debe`} <strong>{euros(debt.amount)}</strong></p>
    <ol className="steps">{stages.map((stage, index) =>
      <li key={stage} className={index <= progress ? "step-active" : ""}><span>{index <= progress ? <Check size={13} /> : index + 1}</span>{stage}</li>
    )}</ol>
    {debt.shared?.waiting ? <div className="form">
      <p className="dialog-description">Envía el enlace a tu amigo. Caduca a los siete días y solo se puede aceptar desde una cuenta.</p>
      {inviteToken && <>
        <button className="primary" onClick={() => shareInvitation(inviteToken)}>Compartir invitación</button>
        <label>Enlace de invitación<input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} /></label>
      </>}
    </div> : debt.stage === "Pendiente" ? <form className="form" onSubmit={(event) => {
      event.preventDefault();
      const detail = String(new FormData(event.currentTarget).get("detail")).trim();
      if (method !== "Dinero" && !detail) return;
      update({ stage: "Propuesta", offer: { method, detail: detail || euros(debt.amount) } }, "Propuesta enviada");
    }}>
      <h3>¿Cómo queréis saldar la deuda?</h3>
      <div className="method-grid">{methods.map(({ name, icon: Icon }) =>
        <button key={name} type="button" className={name === method ? "method selected" : "method"} aria-pressed={name === method} onClick={() => setMethod(name)}><Icon size={19} />{name}</button>
      )}</div>
      <label>{method === "Dinero" ? "Nota (opcional)" : "¿Qué propones?"}<textarea name="detail" required={method !== "Dinero"} maxLength={240} placeholder={method === "Dinero" ? euros(debt.amount) : "Ej. Te invito a cenar el sábado"} /></label>
      <button className="primary form-submit" type="submit" disabled={busy}>Enviar propuesta <ArrowRight size={17} /></button>
    </form> : <>
      <div className="offer"><Sparkles size={21} /><div><strong>{debt.offer?.method}</strong><p>{debt.offer?.detail}</p></div></div>
      {debt.stage === "Propuesta" && (debt.shared && !debt.shared.canRespond
        ? <p className="dialog-description">Tu amigo tiene que responder a la propuesta.</p> : <>
        {!debt.shared && <p className="dialog-description">En la demo puedes responder en nombre de la otra persona.</p>}
        <div className="dialog-actions"><button className="secondary" disabled={busy} onClick={() => update({ stage: "Pendiente", offer: undefined }, "Propuesta rechazada")}>Rechazar</button>
          <button className="primary" disabled={busy} onClick={() => update({ stage: "Aceptada" }, "Propuesta aceptada")}><Check size={17} /> Aceptar propuesta</button></div>
      </>)}
      {debt.stage === "Aceptada" && (debt.shared && debt.direction === "owe"
        ? <p className="dialog-description">Tu amigo podrá confirmar cuando se cumpla lo acordado.</p> : <>
        <p className="dialog-description">{confirming ? "Al confirmar, la deuda dejará de contar en el balance." : "Cuando se cumpla lo acordado, confirma para cerrar la deuda."}</p>
        <div className="dialog-actions">{confirming && <button className="secondary" onClick={() => setConfirming(false)}>Cancelar</button>}
          <button className="primary" disabled={busy} onClick={() => {
            if (confirming) update({ stage: "Saldada" }, "Deuda saldada");
            else setConfirming(true);
          }}><Check size={17} />{confirming ? "Sí, saldar deuda" : "Confirmar pago"}</button></div>
      </>)}
      {debt.stage === "Saldada" && <p className="settled"><Check size={18} /> Deuda saldada</p>}
    </>}
    {(!debt.shared || inviteToken) && <div className="dialog-actions debt-delete-actions">
      <button className="danger" disabled={busy} onClick={() => setConfirmingDelete(true)}>Borrar deuda</button>
    </div>}
  </>;
}
