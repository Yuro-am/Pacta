"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronRight,
  CircleHelp, Coffee, Gift, HandHeart, Handshake, House, LayoutGrid, List, Pizza,
  Plane, Plus, ReceiptText, Sparkles, UsersRound, Wallet, X,
} from "lucide-react";
import { euros, groups, type Debt, type Method } from "../lib/demo";

import { describeSharedDebt, invitationUrl, type SharedDebtRow } from "../lib/shared-debts";
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
const avatars = ["#e8dcff", "#ffdfcf", "#dcf2e7", "#ffdced"];

export default function Home() {
  const [view, setView] = useState<View>("Inicio");
  const [localDebts, setLocalDebts] = useState<Debt[]>([]);
  const [shared, setShared] = useState<{ actor: string; debts: Debt[] } | null>(null);
  const sharedRevision = useRef(0);
  const [sharedError, setSharedError] = useState<{ actor: string; missing: boolean } | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [dialog, setDialog] = useState<"new" | "welcome" | "notifications" | "profile" | "invite" | "register" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [filter, setFilter] = useState<"Todo" | "Pendientes" | "Saldadas">("Todo");
  const [message, setMessage] = useState("");
  const profile = useProfile();
  const { client } = profile;
  const userId = profile.user?.id;
  const sharedUnavailable = sharedError?.actor === userId && sharedError?.missing;
  const usingShared = Boolean(userId && !sharedUnavailable);
  const debts = usingShared ? (shared?.actor === userId ? shared?.debts ?? [] : []) : localDebts;
  const firstName = profile.name.split(/\s+/, 1)[0];
  const initial = Array.from(profile.name)[0]?.toLocaleUpperCase("es");
  const active = debts.find((debt) => debt.id === selected);
  const proposals = debts.filter((debt) => debt.stage === "Propuesta" && (!debt.shared || debt.shared.canRespond));
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
  }

  async function addDebt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || profile.loading) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title")).trim();
    const friend = String(form.get("friend")).trim();
    const amount = Number(form.get("amount"));
    const direction = form.get("direction") === "owed" ? "owed" : "owe";
    if (!title || !friend || !Number.isFinite(amount) || amount <= 0) return;

    if (usingShared && userId && client) {
      setBusy(true);
      try {
        const { data, error } = await client.rpc("pacta_create_debt", {
          p_title: title, p_guest: friend, p_owner_owes: direction === "owe", p_cents: Math.round(amount * 100),
        });
        if (error) throw error;
        storeSharedDebt(data, userId);
        setSelected(data.id);
      } catch {
        setMessage("No se pudo guardar la deuda compartida.");
        return;
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
          <span className="row-copy"><strong>{debt.title}</strong><small>{debt.friend} · {debt.group || "Sin grupo"}</small></span>
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
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <button className="help" onClick={() => setDialog("welcome")}><CircleHelp size={19} /> Sobre Pacta</button>
          <button className="profile" onClick={() => setDialog("profile")} aria-label="Mi perfil"><span className="avatar">{initial}</span><span><strong>{profile.name}</strong><small>Mi espacio personal</small></span></button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="brand mobile-brand" onClick={() => setDialog("welcome")} aria-label="Bienvenida a Pacta"><span className="brand-mark"><Handshake size={21} /></span> pacta<span className="brand-dot">.</span></button>
          <span className="top-label">Mi espacio</span>
          <div className="top-actions">
            <button className="icon-button notification" aria-label="Notificaciones" onClick={() => setDialog("notifications")}><Bell size={19} />{proposals.length > 0 && <i />}</button>
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

            <section className="tip">
              <span className="tip-icon"><Sparkles size={21} /></span>
              <div><strong>Hay más de una forma de saldar cuentas</strong><p>Un café, una pizza o un favor. Vosotros decidís.</p></div>
              <button onClick={() => { const pending = debts.find((debt) => debt.stage !== "Saldada"); if (pending) setSelected(pending.id); else setDialog("welcome"); }}>Cómo funciona <ArrowRight size={16} /></button>
            </section>

            <div className="dashboard-grid">
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
            <div className="page-heading"><div><h1>{group ?? "Tus grupos"}</h1><p>{group ? "Las cuentas de vuestro grupo, en un solo lugar." : "Compartid planes y llevad las cuentas al día."}</p></div>
            <button className="primary heading-action" onClick={() => setDialog("new")}><Plus size={19} /> Nueva deuda</button></div>
            {group ? <>
              <div className="members">{groups.find((item) => item.name === group)?.members.map((member, index) =>
                <span key={member}><span className="avatar" style={{ background: avatars[index % avatars.length] }}>{member === "Álex" ? initial : member[0]}</span>{member === "Álex" ? firstName : member}</span>
              )}</div>
              <div className="section-heading"><h2>Movimientos del grupo</h2></div>
              {debtList(visibleDebts)}
            </> : <div className="groups-page">{groupList()}</div>}
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
        <button onClick={() => navigate("Grupos")} aria-current={view === "Grupos" ? "page" : undefined} className={view === "Grupos" ? "bottom-active" : ""}><UsersRound size={21} /> Grupos</button>
        <button className="bottom-add" onClick={() => setDialog("new")}><span><Plus size={22} /></span> Añadir</button>
        <button onClick={() => navigate("Actividad")} aria-current={view === "Actividad" ? "page" : undefined} className={view === "Actividad" ? "bottom-active" : ""}><List size={22} /> Actividad</button>
      </nav>

      {(dialog || active) && <Modal close={() => { setDialog(null); setSelected(null); }}>
        {dialog === "invite" ? <>
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
        </> : (dialog === "profile" || dialog === "register") ? <ProfileDialog
          profile={profile} initialMode={dialog === "register" ? "register" : invite ? "login" : "profile"} /> : dialog === "welcome" ? <div className="welcome">
          <span className="brand-mark"><Handshake size={39} /></span>
          <h2 id="dialog-title">Bienvenido a PACTA<span className="brand-dot">.</span></h2>
          <p>Comparte gastos y salda cuentas a vuestra manera. Elegid entre dinero, comida, bebidas, favores y otras recompensas.</p>
          <button className="primary" onClick={() => { setDialog(null); navigate("Inicio"); }}>Entrar a Pacta <ArrowRight size={18} /></button>
        </div> : dialog === "new" ? <>
          <h2 id="dialog-title">Nueva deuda</h2><p className="dialog-description">Añade un gasto compartido o algo que quedó pendiente.</p>
          <form className="form" onSubmit={addDebt}>
            <label>Concepto<input name="title" placeholder="Ej. Cena del viernes" required maxLength={70} /></label>
            <div className="form-grid"><label>Amigo o amiga<input name="friend" placeholder="Ej. Ana" required maxLength={40} /></label>
            <label>Importe (€)<input name="amount" type="number" min="0.01" max="999999" step="0.01" placeholder="0,00" required /></label></div>
            <label>Quién debe<select name="direction"><option value="owe">Yo debo</option><option value="owed">Me deben</option></select></label>
            {!usingShared && <label>Grupo<select name="group" defaultValue={group || ""}><option value="">Sin grupo</option>{groups.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>}
            <button className="primary form-submit" type="submit" disabled={busy || profile.loading}><Plus size={18} /> Registrar deuda</button>
          </form>
        </> : dialog === "notifications" ? <>
          <h2 id="dialog-title">Notificaciones</h2><p className="dialog-description">Propuestas que esperan respuesta.</p>
          <div className="debt-list">{proposals.length ? proposals.map((debt) =>
            <button className="debt-row" key={debt.id} onClick={() => { setDialog(null); setSelected(debt.id); }}>
              <span className="tile lilac"><Bell size={19} /></span><span className="row-copy"><strong>{debt.title}</strong><small>{debt.friend} · {debt.offer?.method}</small></span><ChevronRight size={16} />
            </button>) : <p className="empty">No tienes propuestas pendientes.</p>}</div>
        </> : active && <DebtDetail key={active.id} debt={active} update={updateDebt} busy={busy} shareInvitation={shareInvitation} />}
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

function DebtDetail({ debt, update, busy, shareInvitation }: {
  debt: Debt;
  update: (value: Partial<Debt>, notice: string) => void;
  busy: boolean;
  shareInvitation: (token: string) => void;
}) {
  const [method, setMethod] = useState<Method>("Dinero");
  const [confirming, setConfirming] = useState(false);
  const stages = ["Propuesta", "Aceptada", "Saldada"];
  const progress = stages.indexOf(debt.stage);
  const inviteToken = debt.shared?.invite;
  const inviteUrl = inviteToken ? invitationUrl(inviteToken, window.location.origin).href : "";
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
  </>;
}
