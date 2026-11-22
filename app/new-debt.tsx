"use client";

import { Plus } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { euros, groups } from "../lib/demo";
import type { Friend, SocialGroup } from "../lib/social";

export type GroupSplit = { groupId: string; members: string[]; includeSelf: boolean; id: string };

export function NewDebtForm({ friends, onlineGroups, userId, initialGroup, usingShared, disabled, save }: {
  friends: Friend[];
  onlineGroups: SocialGroup[];
  userId?: string;
  initialGroup: string | null;
  usingShared: boolean;
  disabled: boolean;
  save: (data: FormData, split?: GroupSplit) => Promise<string | undefined>;
}) {
  const initialOnlineGroup = onlineGroups.find((item) => item.id === initialGroup);
  const [target, setTarget] = useState(initialOnlineGroup && usingShared ? "group" : "friend");
  const [groupId, setGroupId] = useState(initialOnlineGroup?.id ?? "");
  const [amount, setAmount] = useState("");
  const [includeSelf, setIncludeSelf] = useState(true);
  const [error, setError] = useState("");
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const forGroup = usingShared && target === "group";
  const selectedGroup = onlineGroups.find((item) => item.id === groupId);
  const peers = selectedGroup?.members.filter((member) => member.id !== userId)
    .sort((left, right) => left.id.localeCompare(right.id)) ?? [];
  const cents = Math.round(Number(amount) * 100);
  const shares = peers.length + Number(includeSelf);
  const validSplit = Boolean(selectedGroup && peers.length && cents >= shares);
  const portion = shares ? Math.floor(cents / shares) : 0;
  const extra = shares ? cents % shares : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || (forGroup && !validSplit)) return;
    setError("");
    const data = new FormData(event.currentTarget);
    if (!forGroup) {
      setError((await save(data)) ?? "");
      return;
    }

    const members = peers.map((member) => member.id);
    const key = JSON.stringify([groupId, members, includeSelf, cents, data.get("title"), data.get("direction")]);
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    setError((await save(data, { groupId, members, includeSelf, id: attempt.current.id })) ?? "");
  }

  return <form className="form" onSubmit={submit}>
    <label>Concepto<input name="title" placeholder="Ej. Cena del viernes" required maxLength={70} /></label>
    {usingShared && onlineGroups.length > 0 && <label>Registrar para
      <select value={target} onChange={(event) => setTarget(event.target.value)}>
        <option value="friend">Una persona</option>
        <option value="group">Todo un grupo</option>
      </select>
    </label>}
    {forGroup ? <label>Grupo<select value={groupId} onChange={(event) => setGroupId(event.target.value)} required>
      <option value="">Selecciona un grupo</option>
      {onlineGroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label> : <>
      {friends.length > 0 && usingShared && <label>Amigo de PACTA<select name="friendId" defaultValue="">
        <option value="">Selecciona un amigo o usa un enlace</option>
        {friends.map((friend) => <option key={friend.id} value={friend.id}>{friend.name}</option>)}
      </select></label>}
      <label>{friends.length && usingShared ? "Nombre si vas a enviar un enlace" : "Amigo o amiga"}
        <input name="friend" placeholder="Ej. Ana" required={!usingShared || !friends.length} maxLength={40} />
      </label>
    </>}
    <label>{forGroup ? "Importe total a repartir (€)" : "Importe (€)"}
      <input name="amount" type="number" value={amount} onChange={(event) => setAmount(event.target.value)}
        min="0.01" max="999999" step="0.01" placeholder="0,00" required />
    </label>
    <label>Quién debe<select name="direction"><option value="owe">Yo debo</option><option value="owed">Me deben</option></select></label>
    {forGroup && selectedGroup && <>
      <label className="split-checkbox"><input type="checkbox" checked={includeSelf} onChange={(event) => setIncludeSelf(event.target.checked)} />
        Incluir mi parte en el reparto
      </label>
      {!peers.length ? <p>Todavía no hay otros miembros que hayan aceptado entrar en este grupo.</p> : <div className="split-preview">
        <strong>Reparto entre {shares} {shares === 1 ? "persona" : "personas"}</strong>
        {peers.map((member, index) => <div key={member.id}><span>{member.name}</span>
          {validSplit && <strong>{euros((portion + Number(index < extra)) / 100)}</strong>}
        </div>)}
        {includeSelf && <div><span>Tu parte (sin deuda)</span>{validSplit && <strong>{euros(portion / 100)}</strong>}</div>}
        {cents > 0 && !validSplit && <small>El importe debe dejar al menos un céntimo por persona.</small>}
      </div>}
    </>}
    {!usingShared && <label>Grupo<select name="group" defaultValue={initialGroup || ""}>
      <option value="">Sin grupo</option>{groups.map((item) => <option key={item.name}>{item.name}</option>)}
    </select></label>}
    {error && <p role="alert" className="dialog-description">{error}</p>}
    <button className="primary form-submit" type="submit" disabled={disabled || (forGroup && !validSplit)}>
      <Plus size={18} /> {forGroup ? "Registrar reparto" : "Registrar deuda"}
    </button>
  </form>;
}
