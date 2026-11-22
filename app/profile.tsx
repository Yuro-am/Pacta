"use client";

import { useEffect, useState, type FormEvent } from "react";
import { isAuthError, type AuthError, type User } from "@supabase/supabase-js";
import { createClient } from "../utils/supabase/client";

const defaultName = "Álex García";
const nameKey = "pacta-profile-name-v1";

export function useProfile() {
  const [client] = useState(createClient);
  const [demoName, setDemoName] = useState(defaultName);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(client));

  useEffect(() => {
    try {
      const savedName = localStorage.getItem(nameKey)?.trim();
      if (savedName) setDemoName(savedName);
    } catch { /* The profile remains usable in memory. */ }

    if (!client) return;

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [client]);

  const accountName: unknown = user?.user_metadata.display_name;
  const name = user
    ? (typeof accountName === "string" && accountName.trim()) || user.email?.split("@")[0] || "Amigo"
    : demoName;

  function saveDemoName(value: string) {
    setDemoName(value);
    try { localStorage.setItem(nameKey, value); }
    catch { /* The name is still updated for this visit. */ }
  }

  return { client, user, name, loading, saveDemoName };
}

function authErrorMessage(error: AuthError) {
  switch (error.code) {
    case "invalid_credentials": return "El correo o la contraseña no coinciden.";
    case "email_not_confirmed": return "Confirma tu correo antes de iniciar sesión.";
    case "user_already_exists": return "Ya existe una cuenta con ese correo. Prueba a iniciar sesión.";
    case "weak_password": return "Elige una contraseña más segura.";
    case "over_email_send_rate_limit": return "Se han enviado demasiados correos. Vuelve a intentarlo más tarde.";
    default: return "No se pudo completar la operación. Inténtalo de nuevo en unos minutos.";
  }
}

type ProfileMode = "profile" | "login" | "register";

export function ProfileDialog({ profile, initialMode = "profile" }: {
  profile: ReturnType<typeof useProfile>;
  initialMode?: ProfileMode;
}) {
  const { client, user, name, loading, saveDemoName } = profile;
  const [mode, setMode] = useState<ProfileMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const showProfile = Boolean(user) || mode === "profile";

  function switchMode(value: typeof mode) {
    setMode(value);
    setFeedback(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading) return;
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("name") ?? "").trim();
    if ((showProfile || mode === "register") && !displayName) {
      setFeedback({ text: "Escribe el nombre que quieres mostrar.", error: true });
      return;
    }

    setBusy(true);
    setFeedback(undefined);
    try {
      if (showProfile) {
        if (user && client) {
          const { error } = await client.auth.updateUser({ data: { display_name: displayName } });
          if (error) throw error;
        } else {
          saveDemoName(displayName);
        }
        setFeedback({ text: "Nombre guardado." });
        return;
      }

      if (!client) return;
      const email = String(form.get("email")).trim();
      const password = String(form.get("password"));

      if (mode === "register") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: new URL("/auth/callback", window.location.origin).href,
          },
        });
        if (error) throw error;
        setMode(data.session ? "profile" : "login");
        setFeedback({ text: data.session ? "Cuenta creada." : "Revisa tu correo para confirmar la cuenta." });
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMode("profile");
        setFeedback({ text: "Sesión iniciada." });
      }
    } catch (error) {
      setFeedback({
        text: isAuthError(error)
          ? authErrorMessage(error)
          : "No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.",
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!client || busy) return;
    setBusy(true);
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      setMode("profile");
      setFeedback({ text: "Sesión cerrada." });
    } catch {
      setFeedback({ text: "No se pudo cerrar la sesión. Inténtalo de nuevo.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return <>
    <h2 id="dialog-title">{showProfile ? "Mi perfil" : mode === "register" ? "Crear cuenta" : "Iniciar sesión"}</h2>
    <p className="dialog-description">{user ? user.email : showProfile
      ? "Personaliza tu nombre en este navegador."
      : "Usa tu correo y contraseña para acceder a tu perfil."}</p>
    {loading ? <p role="status">Cargando perfil…</p> : <>
      <form className="form" key={showProfile ? user?.id ?? "demo" : mode} onSubmit={submit}>
        {(showProfile || mode === "register") && <label>Nombre
          <input name="name" autoComplete="name" defaultValue={showProfile ? name : ""} required maxLength={50} />
        </label>}
        {!showProfile && <>
          <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
          <label>Contraseña<input name="password" type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            minLength={mode === "register" ? 8 : undefined} required /></label>
        </>}
        <button className="primary form-submit" type="submit" disabled={busy}>
          {busy ? "Un momento…" : showProfile ? "Guardar nombre" : mode === "register" ? "Crear cuenta" : "Iniciar sesión"}
        </button>
      </form>
      <div className="profile-actions">
        {user ? <button className="secondary" disabled={busy} onClick={signOut}>Cerrar sesión</button>
          : client ? <>
            {mode !== "login" && <button className="secondary" disabled={busy} onClick={() => switchMode("login")}>Iniciar sesión</button>}
            {mode !== "register" && <button className="secondary" disabled={busy} onClick={() => switchMode("register")}>Crear cuenta</button>}
            {!showProfile && <button className="secondary" disabled={busy} onClick={() => switchMode("profile")}>Volver a mi perfil</button>}
          </> : <p>La creación de cuentas estará disponible cuando se configure Supabase.</p>}
      </div>
      {feedback && <p className="dialog-description" role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
    </>}
  </>;
}
