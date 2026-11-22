"use client";

import { useState, type FormEvent } from "react";
import type { SocialData, SocialGroup } from "../lib/social";

type RunAction = (name: string, args: Record<string, string>) => Promise<boolean>;

export function SocialPanel({ data, userId, run, openGroup }: {
  data: SocialData;
  userId: string;
  run: RunAction;
  openGroup: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>, name: string, args: (value: string) => Record<string, string>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = String(new FormData(form).get("value") ?? "").trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      if (await run(name, args(value))) form.reset();
    } finally {
      setBusy(false);
    }
  }

  return <div className="dashboard-grid">
    <section className="social-card">
      <div className="section-heading"><h2>Amigos</h2></div>
      <label>Tu código de amigo
        <input readOnly value={userId} onFocus={(event) => event.currentTarget.select()} />
      </label>
      <button className="secondary" onClick={async () => {
        try { await navigator.clipboard.writeText(userId); setCopied(true); }
        catch { setCopied(false); }
      }}>{copied ? "Código copiado" : "Copiar mi código"}</button>
      <form className="form" onSubmit={(event) => submit(event, "pacta_request_friend", (value) => ({ p_identifier: value }))}>
        <label>Correo o código de tu amigo<input name="value" placeholder="Ej. ana@ejemplo.com" required maxLength={254}
          autoCapitalize="none" spellCheck={false} /></label>
        <button className="primary" disabled={busy}>Enviar solicitud</button>
      </form>
      {data.friends.map((friend) => <div className="social-row" key={friend.id}>
        <span><strong>{friend.name}</strong><small>{friend.accepted ? "Amigo" : friend.incoming ? "Solicitud recibida" : "Solicitud enviada"}</small></span>
        {!friend.accepted && friend.incoming && <div className="social-actions">
          <button className="primary" onClick={() => run("pacta_friend", { p_user: friend.id, p_action: "accept" })}>Aceptar</button>
          <button className="secondary" onClick={() => run("pacta_friend", { p_user: friend.id, p_action: "reject" })}>Rechazar</button>
        </div>}
      </div>)}
    </section>
    <section className="social-card">
      <div className="section-heading"><h2>Grupos</h2></div>
      <form className="form" onSubmit={(event) => submit(event, "pacta_create_group", (value) => ({ p_name: value }))}>
        <label>Nombre del grupo<input name="value" placeholder="Ej. Viaje a Lisboa" required maxLength={50} /></label>
        <button className="primary" disabled={busy}>Crear grupo</button>
      </form>
      {data.groups.map((group) => <div className="social-row" key={group.id}>
        <span><strong>{group.name}</strong><small>{group.accepted ? `${group.members.length} miembros` : "Invitación pendiente"}</small></span>
        {group.accepted ? <button className="secondary" onClick={() => openGroup(group.id)}>Abrir</button>
          : <div className="social-actions">
            <button className="primary" onClick={() => run("pacta_group_member", { p_group: group.id, p_action: "accept" })}>Aceptar</button>
            <button className="secondary" onClick={() => run("pacta_group_member", { p_group: group.id, p_action: "reject" })}>Rechazar</button>
          </div>}
      </div>)}
    </section>
  </div>;
}

export function GroupInvite({ group, friends, run }: { group: SocialGroup; friends: SocialData["friends"]; run: RunAction }) {
  const available = friends.filter((friend) => friend.accepted && !group.members.some((member) => member.id === friend.id));
  if (!group.owner || !available.length) return null;
  return <form className="social-card form" onSubmit={(event) => {
    event.preventDefault();
    const friend = String(new FormData(event.currentTarget).get("friend"));
    if (friend) void run("pacta_group_member", { p_group: group.id, p_action: "invite", p_user: friend });
  }}>
    <label>Añadir al grupo<select name="friend" required defaultValue="">
      <option value="" disabled>Selecciona un amigo</option>
      {available.map((friend) => <option key={friend.id} value={friend.id}>{friend.name}</option>)}
    </select></label>
    <button className="primary">Invitar al grupo</button>
  </form>;
}
