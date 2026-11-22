"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { isAuthError, isAuthRetryableFetchError, type AuthError, type User } from "@supabase/supabase-js";
import { createClient } from "../utils/supabase/client";

const defaultName = "Invitado";
const nameKey = "pacta-profile-name-v1";
const usernamePattern = "[a-zA-Z0-9_]{3,24}";

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
  if (isAuthRetryableFetchError(error)) {
    return "No pudimos conectar con el servicio de cuentas. Comprueba tu conexión y vuelve a intentarlo.";
  }
  switch (error.code) {
    case "invalid_credentials": return "El correo o la contraseña no coinciden.";
    case "email_not_confirmed": return "Confirma tu correo para entrar. Si no te llegó, pulsa Reenviar confirmación.";
    case "user_already_exists": return "Ya existe una cuenta con ese correo. Prueba a iniciar sesión.";
    case "weak_password": return "Elige una contraseña más segura.";
    case "email_address_not_authorized": return "El servicio de correo todavía no puede enviar confirmaciones a esta dirección. Contacta con quien administra PACTA.";
    case "signup_disabled": return "El registro de cuentas está desactivado en este momento.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit": return "Se han enviado demasiados correos. Vuelve a intentarlo más tarde.";
    default: return "No se pudo completar la operación. Inténtalo de nuevo en unos minutos.";
  }
}

type ProfileMode = "profile" | "login" | "register" | "access";

export function ProfileDialog({ profile, initialMode = "profile" }: {
  profile: ReturnType<typeof useProfile>;
  initialMode?: ProfileMode;
}) {
  const { client, user, name, loading, saveDemoName } = profile;
  const [mode, setMode] = useState<ProfileMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [resendCoolingDown, setResendCoolingDown] = useState(false);
  const [sessionDelayed, setSessionDelayed] = useState(false);
  const [username, setUsername] = useState("");
  const [loadingUsername, setLoadingUsername] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const showProfile = Boolean(user) || mode === "profile";

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setSessionDelayed(true), 12_000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (!resendCoolingDown) return;
    const timer = setTimeout(() => setResendCoolingDown(false), 60_000);
    return () => clearTimeout(timer);
  }, [resendCoolingDown]);

  useEffect(() => {
    if (!client || !user) return;
    let active = true;
    setLoadingUsername(true);
    void client.rpc("pacta_my_username").then(({ data }) => {
      if (!active) return;
      const suggested: unknown = user.user_metadata.requested_username;
      if (typeof data === "string") setUsername(data);
      else setUsername(typeof suggested === "string" && new RegExp(`^${usernamePattern}$`).test(suggested) ? suggested : "");
      setLoadingUsername(false);
    });
    return () => { active = false; };
  }, [client, user]);

  async function saveUsername(value: string) {
    if (!client || !value) return;
    const { error } = await client.rpc("pacta_set_username", { p_username: value });
    if (!error) return;

    return error.code === "23505" ? "Ese nombre de usuario ya está ocupado. Elige otro."
      : error.code === "PGRST202" ? "El nombre de usuario aún no está activado en Supabase."
      : "No se pudo guardar el nombre de usuario. Inténtalo de nuevo.";
  }

  function switchMode(value: typeof mode) {
    const input = formRef.current?.elements.namedItem("email");
    if (input instanceof HTMLInputElement) setEmailDraft(input.value.trim());
    setMode(value);
    setFeedback(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading) return;
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("name") ?? "").trim();
    const handle = String(form.get("username") ?? "").trim().toLowerCase();
    if ((mode === "register" || handle) && !new RegExp(`^${usernamePattern}$`).test(handle)) {
      setFeedback({ text: "Usa entre 3 y 24 letras, números o guiones bajos.", error: true });
      return;
    }
    if ((showProfile || mode === "register") && !displayName) {
      setFeedback({ text: "Escribe el nombre que quieres mostrar.", error: true });
      return;
    }

    setBusy(true);
    setFeedback(undefined);
    try {
      if (showProfile) {
        if (user && client) {
          const handleError = await saveUsername(handle);
          if (handleError) {
            setFeedback({ text: handleError, error: true });
            return;
          }
          const { error } = await client.auth.updateUser({ data: { display_name: displayName } });
          if (error) throw error;
          if (handle) setUsername(handle);
        } else {
          saveDemoName(displayName);
        }
        setFeedback({ text: "Nombre guardado." });
        return;
      }

      if (!client) return;
      const email = String(form.get("email")).trim();
      setEmailDraft(email);
      const password = String(form.get("password"));

      if (mode === "register") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName, requested_username: handle },
            emailRedirectTo: new URL("/auth/callback", window.location.origin).href,
          },
        });
        if (error) throw error;
        setMode(data.session ? "profile" : "login");
        if (data.session) {
          const handleError = await saveUsername(handle);
          setUsername(handle);
          setFeedback({ text: handleError ? `Cuenta creada. ${handleError}` : "Cuenta creada. Ya has iniciado sesión.", error: Boolean(handleError) });
        } else {
          setResendCoolingDown(true);
          setFeedback({ text: "Tu cuenta está pendiente. Si Supabase pide confirmación, revisa tu correo o solicita un reenvío." });
        }
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

  async function resendConfirmation() {
    if (!client || busy || resendCoolingDown) return;
    const input = formRef.current?.elements.namedItem("email");
    if (!(input instanceof HTMLInputElement) || !input.reportValidity()) return;
    const email = input.value.trim();
    setEmailDraft(email);
    setBusy(true);
    setFeedback(undefined);

    try {
      const { error } = await client.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: new URL("/auth/callback", window.location.origin).href },
      });
      if (error) throw error;
      setResendCoolingDown(true);
      setFeedback({ text: "Si la cuenta está pendiente de confirmar, recibirás un enlace. Revisa también spam." });
    } catch (error) {
      setFeedback({
        text: isAuthError(error) ? authErrorMessage(error) : "No pudimos solicitar el correo. Inténtalo de nuevo.",
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
      setUsername("");
      setLoadingUsername(false);
      setFeedback({ text: "Sesión cerrada." });
    } catch {
      setFeedback({ text: "No se pudo cerrar la sesión. Inténtalo de nuevo.", error: true });
    } finally {
      setBusy(false);
    }
  }

  if (mode === "access" && !user) return <div className="welcome">
    <h2 id="dialog-title">Entra en PACTA</h2>
    <p>Inicia sesión o crea una cuenta para compartir deudas y chatear con tus amigos.</p>
    <div className="welcome-actions">
      <button className="primary" onClick={() => switchMode("register")}>Crear cuenta</button>
      <button className="secondary" onClick={() => switchMode("login")}>Iniciar sesión</button>
    </div>
  </div>;

  return <>
    <h2 id="dialog-title">{showProfile ? "Mi perfil" : mode === "register" ? "Crear cuenta" : "Iniciar sesión"}</h2>
    <p className="dialog-description">{user ? user.email : showProfile
      ? "Personaliza tu nombre en este navegador."
      : "Usa tu correo y contraseña para acceder a tu perfil."}</p>
    {loading ? (sessionDelayed ? <>
      <p role="status">La sesión tarda más de lo normal en cargar.</p>
      <div className="profile-actions"><button className="secondary" onClick={() => window.location.reload()}>Volver a intentar</button></div>
    </> : <p role="status">Cargando perfil…</p>) : <>
      <form ref={formRef} className="form" key={showProfile ? user?.id ?? "demo" : mode} onSubmit={submit}>
        {(showProfile || mode === "register") && <label>Nombre
          <input name="name" autoComplete="name" defaultValue={showProfile ? name : ""} required maxLength={50} />
        </label>}
        {(user || mode === "register") && <label>Nombre de usuario
          <input name="username" value={username} onChange={(event) => setUsername(event.target.value)}
            autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Ej. yurik_21" pattern={usernamePattern}
            required={mode === "register"} maxLength={24} disabled={loadingUsername || busy} />
          <small>Entre 3 y 24 letras, números o guiones bajos. Tus amigos te buscarán por este nombre.</small>
        </label>}
        {!showProfile && <>
          <label>Correo electrónico<input name="email" type="email" autoComplete="email" defaultValue={emailDraft} required /></label>
          <label>Contraseña<input name="password" type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            minLength={mode === "register" ? 8 : undefined} required /></label>
        </>}
        <button className="primary form-submit" type="submit" disabled={busy || loadingUsername}>
          {busy ? "Un momento…" : showProfile ? (user ? "Guardar perfil" : "Guardar nombre") : mode === "register" ? "Crear cuenta" : "Iniciar sesión"}
        </button>
      </form>
      <div className="profile-actions">
        {user ? <button className="secondary" disabled={busy} onClick={signOut}>Cerrar sesión</button>
          : client ? <>
            {mode === "login" && <button className="secondary" disabled={busy || resendCoolingDown} onClick={resendConfirmation}>
              {resendCoolingDown ? "Espera un minuto para reenviar" : "Reenviar confirmación"}
            </button>}
            {mode !== "login" && <button className="secondary" disabled={busy} onClick={() => switchMode("login")}>Iniciar sesión</button>}
            {mode !== "register" && <button className="secondary" disabled={busy} onClick={() => switchMode("register")}>Crear cuenta</button>}
            {!showProfile && <button className="secondary" disabled={busy} onClick={() => switchMode(initialMode === "access" ? "access" : "profile")}>
              {initialMode === "access" ? "Volver" : "Volver a mi perfil"}
            </button>}
          </> : <p>La creación de cuentas estará disponible cuando se configure Supabase.</p>}
      </div>
      {feedback && <p className="dialog-description" role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
    </>}
  </>;
}
