"use client";

import { useEffect, useState } from "react";
import { euros } from "../lib/demo";
import type { createClient } from "../utils/supabase/client";

type MemberBalance = { user_id: string; name: string; owes_cents: number; owed_cents: number };

export function GroupBalances({ client, groupId, userId, refreshKey }: {
  client: NonNullable<ReturnType<typeof createClient>>;
  groupId: string;
  userId: string;
  refreshKey: string;
}) {
  const [balances, setBalances] = useState<MemberBalance[]>();
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;

    async function refresh() {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const { data, error } = await client.rpc("pacta_group_balances", { p_group: groupId }).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (error) {
          setError(error.code === "PGRST202" ? "El saldo por persona aún no está activado en Supabase."
            : "No se pudo actualizar el saldo del grupo.");
        } else {
          setError("");
          setBalances(data);
        }
      } catch {
        if (!controller.signal.aborted) setError("No se pudo actualizar el saldo del grupo.");
      } finally {
        inFlight = false;
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, 12000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [client, groupId, refreshKey]);

  return <section className="group-balances" aria-labelledby="group-balances-title">
    <div className="section-heading"><h2 id="group-balances-title">Saldo por persona</h2></div>
    {error && <p role="status" className="dialog-description">{error}</p>}
    {balances ? <div className="debt-list"><table className="group-balance-table">
      <thead><tr><th scope="col">Miembro</th><th scope="col">Debe</th><th scope="col">Le deben</th></tr></thead>
      <tbody>{balances.map((member) => <tr key={member.user_id}>
        <th scope="row">{member.name}{member.user_id === userId && <small>Tú</small>}</th>
        <td>{euros(member.owes_cents / 100)}</td>
        <td className={member.owed_cents > 0 ? "positive" : undefined}>{euros(member.owed_cents / 100)}</td>
      </tr>)}</tbody>
    </table></div> : !error && <p role="status" className="dialog-description">Cargando saldos…</p>}
  </section>;
}
