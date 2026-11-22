"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronRight,
  CircleHelp, Coffee, Gift, HandHeart, Handshake, House, LayoutGrid, List, Pizza,
  Plane, Plus, ReceiptText, Sparkles, UsersRound, Wallet, X,
} from "lucide-react";
import { euros, groups, sample, type Debt, type Method } from "../lib/demo";

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
  const [debts, setDebts] = useState<Debt[]>(sample);
  const [ready, setReady] = useState(false);
  const [dialog, setDialog] = useState<"new" | "welcome" | "notifications" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [filter, setFilter] = useState<"Todo" | "Pendientes" | "Saldadas">("Todo");
  const [message, setMessage] = useState("");
  const active = debts.find((debt) => debt.id === selected);
  const proposals = debts.filter((debt) => debt.stage === "Propuesta");
  const owed = debts.reduce((sum, debt) => sum + (debt.stage !== "Saldada" && debt.direction === "owed" ? Math.round(debt.amount * 100) : 0), 0) / 100;
  const owe = debts.reduce((sum, debt) => sum + (debt.stage !== "Saldada" && debt.direction === "owe" ? Math.round(debt.amount * 100) : 0), 0) / 100;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("pacta-debts-v1");
      if (saved) setDebts(JSON.parse(saved));
    } catch { /* Fall back to demo data if storage is unavailable. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      try { localStorage.setItem("pacta-debts-v1", JSON.stringify(debts)); }
      catch { /* The demo remains usable in memory. */ }
    }
  }, [debts, ready]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3200);
    return () => clearTimeout(timer);
  }, [message]);

  function navigate(next: View) {
    setView(next);
    setGroup(null);
    setFilter("Todo");
  }

  function addDebt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title")).trim();
    const friend = String(form.get("friend")).trim();
    const amount = Number(form.get("amount"));
    if (!title || !friend || !Number.isFinite(amount) || amount <= 0) return;
    setDebts((previous) => [{
      id: crypto.randomUUID(), title, friend, amount, date: "Hoy",
      group: String(form.get("group")), kind: "other", stage: "Pendiente",
      direction: form.get("direction") === "owed" ? "owed" : "owe",
    }, ...previous]);
    setDialog(null);
    navigate("Actividad");
    setMessage("Deuda registrada");
  }

  function updateDebt(update: Partial<Debt>, notice: string) {
    setDebts((previous) => previous.map((debt) => debt.id === selected ? { ...debt, ...update } : debt));
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
          <div className="profile"><span className="avatar">A</span><span><strong>Álex García</strong><small>Mi espacio personal</small></span></div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="brand mobile-brand" onClick={() => setDialog("welcome")} aria-label="Bienvenida a Pacta"><span className="brand-mark"><Handshake size={21} /></span> pacta<span className="brand-dot">.</span></button>
          <span className="top-label">Mi espacio</span>
          <div className="top-actions">
            <button className="icon-button notification" aria-label="Notificaciones" onClick={() => setDialog("notifications")}><Bell size={19} />{proposals.length > 0 && <i />}</button>
            <button className="avatar top-avatar" onClick={() => setDialog("welcome")} aria-label="Álex García">A</button>
          </div>
        </header>

        <div className="content">
          {view === "Inicio" ? <>
            <div className="page-heading">
              <div><h1>¡Hola, Álex! <span className="wave">👋</span></h1><p>Así van vuestras cuentas entre amigos.</p></div>
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
                <span key={member}><span className="avatar" style={{ background: avatars[index % avatars.length] }}>{member[0]}</span>{member}</span>
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
        {dialog === "welcome" ? <div className="welcome">
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
            <label>Grupo<select name="group" defaultValue={group || ""}><option value="">Sin grupo</option>{groups.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>
            <button className="primary form-submit" type="submit"><Plus size={18} /> Registrar deuda</button>
          </form>
        </> : dialog === "notifications" ? <>
          <h2 id="dialog-title">Notificaciones</h2><p className="dialog-description">Propuestas que esperan respuesta.</p>
          <div className="debt-list">{proposals.length ? proposals.map((debt) =>
            <button className="debt-row" key={debt.id} onClick={() => { setDialog(null); setSelected(debt.id); }}>
              <span className="tile lilac"><Bell size={19} /></span><span className="row-copy"><strong>{debt.title}</strong><small>{debt.friend} · {debt.offer?.method}</small></span><ChevronRight size={16} />
            </button>) : <p className="empty">No tienes propuestas pendientes.</p>}</div>
        </> : active && <DebtDetail key={active.id} debt={active} update={updateDebt} />}
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

function DebtDetail({ debt, update }: { debt: Debt; update: (value: Partial<Debt>, notice: string) => void }) {
  const [method, setMethod] = useState<Method>("Dinero");
  const [confirming, setConfirming] = useState(false);
  const stages = ["Propuesta", "Aceptada", "Saldada"];
  const progress = stages.indexOf(debt.stage);
  return <>
    <h2 id="dialog-title">{debt.title}</h2>
    <p className="dialog-description">{debt.direction === "owe" ? `Le debes a ${debt.friend}` : `${debt.friend} te debe`} <strong>{euros(debt.amount)}</strong></p>
    <ol className="steps">{stages.map((stage, index) =>
      <li key={stage} className={index <= progress ? "step-active" : ""}><span>{index <= progress ? <Check size={13} /> : index + 1}</span>{stage}</li>
    )}</ol>
    {debt.stage === "Pendiente" ? <form className="form" onSubmit={(event) => {
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
      <button className="primary form-submit" type="submit">Enviar propuesta <ArrowRight size={17} /></button>
    </form> : <>
      <div className="offer"><Sparkles size={21} /><div><strong>{debt.offer?.method}</strong><p>{debt.offer?.detail}</p></div></div>
      {debt.stage === "Propuesta" && <>
        <p className="dialog-description">En la demo puedes responder en nombre de la otra persona.</p>
        <div className="dialog-actions"><button className="secondary" onClick={() => update({ stage: "Pendiente", offer: undefined }, "Propuesta rechazada")}>Rechazar</button>
          <button className="primary" onClick={() => update({ stage: "Aceptada" }, "Propuesta aceptada")}><Check size={17} /> Aceptar propuesta</button></div>
      </>}
      {debt.stage === "Aceptada" && <>
        <p className="dialog-description">{confirming ? "Al confirmar, la deuda dejará de contar en el balance." : "Cuando se cumpla lo acordado, confirma para cerrar la deuda."}</p>
        <div className="dialog-actions">{confirming && <button className="secondary" onClick={() => setConfirming(false)}>Cancelar</button>}
          <button className="primary" onClick={() => {
            if (confirming) update({ stage: "Saldada" }, "Deuda saldada");
            else setConfirming(true);
          }}><Check size={17} />{confirming ? "Sí, saldar deuda" : "Confirmar pago"}</button></div>
      </>}
      {debt.stage === "Saldada" && <p className="settled"><Check size={18} /> Deuda saldada</p>}
    </>}
  </>;
}
