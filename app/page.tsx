"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { flushSync } from "react-dom";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Check, ChevronDown, ChevronRight,
  CircleDollarSign, CircleHelp, Coffee, Gift, HandHeart, House, LayoutGrid, List, Pizza,
  Plane, Plus, ReceiptText, Sparkles, MessageCircle, UsersRound, Wallet, X, Trash2,
} from "lucide-react";
import { euros, groups, type Debt, type Method } from "../lib/demo";

import { watchUserActivity } from "../lib/social-realtime";
import { watchSharedDebts } from "../lib/debt-realtime";
import { describeSharedDebt, invitationUrl, type SharedDebtRow } from "../lib/shared-debts";
import type { DebtNotice } from "../lib/inbox";
import type { ChatTarget, Person, SocialData, SocialGroup } from "../lib/social";
import { MobilePush } from "./mobile-push";
import { Notifications } from "./notifications";
import { ChatDirectory } from "./chat-directory";
import { useInbox } from "./use-inbox";
import { ChatDialog } from "./chat";
import { DebtGesture } from "./debt-gesture";
import { GroupBalances } from "./group-balances";
import { GroupInvite, SocialPanel } from "./social";
import { ShareAppButton, ShareAppDialog } from "./share-app";
import { AppearancePicker, useAppearance } from "./appearance";
import { NewDebtForm, type GroupSplit } from "./new-debt";
import { ProfileDialog, useProfile } from "./profile";

const nav = [
  { label: "Inicio", icon: LayoutGrid },
  { label: "Social", icon: UsersRound },
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

type TrashAction = "trash" | "restore" | "purge";

function canTrash(debt: Debt) {
  return !debt.shared || (debt.shared.owned && ["Pendiente", "Propuesta", "Saldada"].includes(debt.stage));
}

export default function Home() {
  const [view, setView] = useState<View>("Inicio");
  const [viewDirection, setViewDirection] = useState<"forward" | "backward">();
  const bottomNav = useRef<HTMLElement>(null);
  const swipeViewport = useRef<HTMLDivElement>(null);
  const swipeTrack = useRef<HTMLDivElement>(null);
  const viewIndex = nav.findIndex(({ label }) => label === view);
  const [touchNavigation, setTouchNavigation] = useState(false);
  const swipeTimer = useRef<number | undefined>(undefined);
  const swipeFrame = useRef<number | undefined>(undefined);
  const finishSlide = useRef<(() => void) | null>(null);
  useEffect(() => {
    const touch = window.matchMedia("(any-pointer: coarse)");
    function updateTouchNavigation() { setTouchNavigation(touch.matches); }
    updateTouchNavigation();
    touch.addEventListener("change", updateTouchNavigation);
    return () => {
      touch.removeEventListener("change", updateTouchNavigation);
      window.clearTimeout(swipeTimer.current);
      if (swipeFrame.current !== undefined) window.cancelAnimationFrame(swipeFrame.current);
    };
  }, []);
  const swipe = useRef<{
    id: number; x: number; y: number; distance: number; paintedDistance: number; width: number; scrollTop: number;
    horizontal: boolean; preview?: View;
  } | null>(null);
  const [localDebts, setLocalDebts] = useState<Debt[]>([]);
  const [shared, setShared] = useState<{ actor: string; debts: Debt[]; signature?: string } | null>(null);
  const [socialState, setSocialState] = useState<{ actor: string; data: SocialData; signature: string } | null>(null);
  const [socialUnavailableFor, setSocialUnavailableFor] = useState<string | null>(null);
  const socialRevision = useRef(0);
  const socialActionInProgress = useRef(false);
  const sharedRevision = useRef(0);
  const [sharedError, setSharedError] = useState<{ actor: string; missing: boolean } | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [dialog, setDialog] = useState<"new" | "welcome" | "notifications" | "profile" | "invite" | "register" | "messages" | "access" | "shareApp" | null>(null);
  const checkedFirstAccess = useRef(false);
  const messageArea = useRef<HTMLDivElement>(null);
  const messageButton = useRef<HTMLButtonElement>(null);
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [trashPrompt, setTrashPrompt] = useState<{ id: string; action: "trash" | "purge" } | null>(null);
  const [trashError, setTrashError] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [filter, setFilter] = useState<"Todo" | "Pendientes" | "Saldadas">("Todo");
  const [showTrash, setShowTrash] = useState(false);
  const [message, setMessage] = useState("");
  const profile = useProfile();
  const appearance = useAppearance();
  const { client } = profile;
  const userId = profile.user?.id;
  const { inbox, refresh: refreshInbox } = useInbox(client, userId);
  const [groupChatRevision, setGroupChatRevision] = useState(0);
  const refreshGroupChats = useCallback(() => setGroupChatRevision((previous) => previous + 1), []);

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
  useEffect(() => { setChatTarget(null); }, [userId]);
  const sharedUnavailable = sharedError?.actor === userId && sharedError?.missing;
  const usingShared = Boolean(userId && !sharedUnavailable);
  const social = socialState?.actor === userId ? socialState?.data : undefined;
  const realGroup = social?.groups.find((item) => item.id === group && item.accepted);
  const groupName = realGroup?.name ?? (!userId ? groups.find((item) => item.name === group)?.name : undefined);
  const friendsForDebt = social?.friends.filter((friend) => friend.accepted) ?? [];
  const groupsForDebt = social?.groups.filter((item) => item.accepted) ?? [];
  const allDebts = usingShared ? (shared?.actor === userId ? shared?.debts ?? [] : []) : localDebts;
  const debts = allDebts.filter((debt) => !debt.trashedAt);
  const trash = allDebts.filter((debt) => debt.trashedAt && canTrash(debt));
  const trashDebt = allDebts.find((debt) => debt.id === trashPrompt?.id && canTrash(debt));
  const firstName = profile.name.split(/\s+/, 1)[0];
  const initial = Array.from(profile.name)[0]?.toLocaleUpperCase("es");
  const active = debts.find((debt) => debt.id === selected);
  const pendingSocial = (social?.friends.filter((friend) => friend.incoming && !friend.accepted).length ?? 0)
    + (social?.groups.filter((item) => !item.accepted).length ?? 0);
  const proposals = debts.filter((debt) => debt.stage === "Propuesta" && (!debt.shared || debt.shared.canRespond));
  const proposalIds = new Set(proposals.map((debt) => debt.id));
  const notices = (inbox?.notices ?? []).filter((notice) => notice.kind !== "proposal" || !proposalIds.has(notice.debt_id));
  const hiddenUnreadProposals = inbox?.notices.filter((notice) => notice.unread && notice.kind === "proposal" && proposalIds.has(notice.debt_id)).length ?? 0;
  const unread = (inbox?.unread_messages ?? 0) + Math.max(0, (inbox?.unread_debts ?? 0) - hiddenUnreadProposals)
    + proposals.length + pendingSocial;
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
    else {
      const notice = url.searchParams.get("aviso");
      if (notice === "solicitudes") setView("Social");
      if (notice === "notificaciones") setDialog("notifications");
      if (notice === "mensajes") setDialog("messages");
    }
    url.searchParams.delete("aviso");
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
    let inFlight = false;
    let queued = false;
    let liveTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function refresh() {
      if (!client || !userId || controller.signal.aborted || document.hidden) return;
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      const revision = ++sharedRevision.current;
      try {
        const { data, error } = await client.from("shared_debts").select("*")
          .order("created_at", { ascending: false }).abortSignal(controller.signal);
        if (controller.signal.aborted || revision !== sharedRevision.current) return;
        setSharedError(error ? { actor: userId, missing: ["42P01", "PGRST205"].includes(error.code) } : null);
        if (data) {
          const signature = JSON.stringify(data);
          setShared((previous) => previous?.actor === userId && previous.signature === signature ? previous : {
            actor: userId,
            debts: (data as SharedDebtRow[]).map((row) => describeSharedDebt(row, userId)),
            signature,
          });
        }
      } catch {
        if (!controller.signal.aborted && revision === sharedRevision.current) setSharedError({ actor: userId, missing: false });
      } finally {
        inFlight = false;
        if (queued) {
          queued = false;
          void refresh();
        }
      }
    }

    function refreshFromEvent() {
      if (controller.signal.aborted || liveTimer) return;
      liveTimer = setTimeout(() => {
        liveTimer = undefined;
        if (document.hidden) return;
        void refresh();
        void refreshInbox();
      }, 80);
    }

    void refresh();
    const stopWatching = watchSharedDebts(client, userId, refreshFromEvent);
    const timer = window.setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      stopWatching();
      clearTimeout(liveTimer);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [client, userId, refreshInbox]);

  const refreshSocial = useCallback(async () => {
    if (!client || !userId) return;
    const revision = ++socialRevision.current;
    const { data, error } = await client.rpc("pacta_social");
    if (revision !== socialRevision.current) return;
    if (data && !error) {
      const signature = JSON.stringify(data);
      setSocialState((previous) => previous?.actor === userId && previous.signature === signature
        ? previous : { actor: userId, data, signature });
      setSocialUnavailableFor(null);
    } else {
      setSocialUnavailableFor(userId);
    }
  }, [client, userId]);

  useEffect(() => {
    if (!client || !userId) return;
    const requests = () => { if (!document.hidden) void refreshSocial(); };
    const messages = () => { if (!document.hidden) void refreshInbox(); };
    requests();
    const stopWatching = watchUserActivity(client, userId, { messages, requests });
    const timer = window.setInterval(requests, 20000);
    document.addEventListener("visibilitychange", requests);
    return () => {
      socialRevision.current++;
      stopWatching();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", requests);
    };
  }, [client, userId, refreshInbox, refreshSocial]);

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

  async function deleteGroup(item: SocialGroup) {
    if (!window.confirm(`¿Borrar «${item.name}» y su chat para todos? Las deudas seguirán en Actividad.`)) return;
    if (await runSocialAction("pacta_delete_group", { p_group: item.id })) {
      setGroup((current) => current === item.id ? null : current);
      refreshGroupChats();
    }
  }

  function openConversation(target: ChatTarget) {
    setDialog(null);
    setSelected(null);
    setChatTarget(target);
  }

  function openChat(friend: Person) {
    openConversation({ kind: "friend", id: friend.id, name: friend.name });
  }

  function openGroupChat(group: SocialGroup) {
    openConversation({ kind: "group", id: group.id, name: group.name, members: group.members });
  }

  async function openDebtNotice(notice: DebtNotice) {
    if (!client || !userId || busy) return;
    let debt = debts.find((item) => item.id === notice.debt_id);
    if (!debt) {
      setBusy(true);
      try {
        const { data, error } = await client.from("shared_debts").select("*").eq("id", notice.debt_id).single();
        if (error || !data || data.trashed_at) {
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

  async function markDebtNotices(items: DebtNotice[]) {
    if (!client || !userId || !items.length) return;
    const results = await Promise.all(items.map((notice) => client.rpc("pacta_read_debt_notice", { p_notice: notice.id })));
    await refreshInbox();
    if (results.some(({ error }) => error)) throw new Error("Some notices remain unread");
  }

  function openProposal(debt: Debt) {
    setDialog(null);
    setSelected(debt.id);
    const related = inbox?.notices.filter((notice) => notice.kind === "proposal" && notice.debt_id === debt.id && notice.unread) ?? [];
    void markDebtNotices(related).catch(() => undefined);
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

  function selectView(next: View, animate: boolean) {
    if (next !== view) {
      setViewDirection(!animate ? undefined : nav.findIndex(({ label }) => label === next) > viewIndex
        ? "forward" : "backward");
    }
    setView(next);
    setGroup(null);
    setFilter("Todo");
  }

  function navigate(next: View) {
    if (swipe.current?.horizontal) return;
    if (swipeTimer.current !== undefined) clearSwipePreview();
    selectView(next, true);
    if (next === "Social" && next !== view) void refreshSocial();
  }

  function startSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (!touchNavigation || !event.isPrimary || event.pointerType !== "touch" || dialog || swipeTimer.current !== undefined) return;
    if (event.clientX < 12 || event.clientX > window.innerWidth - 12) return;
    if (!(event.target instanceof Element) || event.target.closest(".topbar, input, select, textarea, label, [contenteditable]")) return;
    const viewport = swipeViewport.current;
    if (!viewport) return;
    swipe.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0, paintedDistance: 0, width: viewport.clientWidth,
      scrollTop: Math.max(0, window.scrollY), horizontal: false,
    };
  }

  function clearSwipePreview() {
    window.clearTimeout(swipeTimer.current);
    swipeTimer.current = undefined;
    finishSlide.current = null;
    const viewport = swipeViewport.current;
    if (viewport) {
      delete viewport.dataset.settling;
      delete viewport.dataset.preview;
      viewport.style.removeProperty("--swipe-preview-top");
      viewport.style.removeProperty("--swipe-duration");
    }
    swipeTrack.current?.style.removeProperty("transform");
    const bar = bottomNav.current;
    if (bar) {
      delete bar.dataset.sliding;
      bar.style.removeProperty("--swipe-offset");
    }
  }

  function settleSwipe(next?: View, direction = 0) {
    const start = swipe.current;
    if (!start) return;
    swipe.current = null;
    if (swipeFrame.current !== undefined) {
      window.cancelAnimationFrame(swipeFrame.current);
      swipeFrame.current = undefined;
    }
    const bar = bottomNav.current;
    if (bar) {
      delete bar.dataset.swiping;
      bar.style.removeProperty("--swipe-stretch");
      if (next) {
        bar.style.setProperty("--swipe-offset", `calc(${-direction} * (100% + 6px))`);
      } else {
        bar.style.removeProperty("--swipe-offset");
      }
    }

    const viewport = swipeViewport.current;
    const track = swipeTrack.current;
    if (!viewport || !track) {
      clearSwipePreview();
      return;
    }
    const complete = () => {
      // Promote the visible pane before removing the track's final position.
      if (next) {
        flushSync(() => selectView(next, false));
        window.scrollTo({ top: 0, behavior: "instant" });
      }
      clearSwipePreview();
      if (next === "Social") void refreshSocial();
    };
    const destination = next ? direction * start.width : 0;
    const remaining = Math.abs(destination - start.paintedDistance);
    if (remaining < 1 || !viewport.dataset.preview || (next && viewport.dataset.preview !== (direction < 0 ? "right" : "left"))
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      complete();
      return;
    }
    const duration = Math.round(75 + 105 * Math.min(remaining / start.width, 1));
    viewport.style.setProperty("--swipe-duration", `${duration}ms`);
    viewport.dataset.settling = "";
    track.style.transform = `translate3d(${destination}px, 0, 0)`;
    finishSlide.current = complete;
    swipeTimer.current = window.setTimeout(complete, duration + 40);
  }

  function moveSwipe(event: ReactPointerEvent<HTMLElement>) {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.horizontal) {
      const horizontal = Math.abs(dx);
      const vertical = Math.abs(dy);
      if (vertical >= 8 && vertical >= horizontal) {
        swipe.current = null;
        return;
      }
      if (horizontal < 6 || horizontal < vertical * 1.35) return;
      start.horizontal = true;
      swipeViewport.current?.style.setProperty("--swipe-preview-top", `${start.scrollTop}px`);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const direction = dx < 0 ? 1 : -1;
    const next = nav[viewIndex + direction]?.label;
    start.preview = next;
    start.distance = next ? -direction * Math.min(Math.abs(dx), start.width) : dx * 28 / (Math.abs(dx) + 100);
    if (swipeFrame.current !== undefined) return;
    swipeFrame.current = window.requestAnimationFrame(() => {
      swipeFrame.current = undefined;
      if (swipe.current !== start) return;
      const viewport = swipeViewport.current;
      if (viewport) {
        const side = start.preview && start.distance !== 0 ? start.distance < 0 ? "right" : "left" : "edge";
        if (viewport.dataset.preview !== side) viewport.dataset.preview = side;
      }
      const track = swipeTrack.current;
      if (track) track.style.transform = `translate3d(${start.distance}px, 0, 0)`;
      start.paintedDistance = start.distance;
      const bar = bottomNav.current;
      if (!bar) return;
      const progress = start.preview ? -start.distance / start.width : 0;
      if (bar.dataset.swiping === undefined) bar.dataset.swiping = "";
      bar.toggleAttribute("data-sliding", Boolean(start.preview));
      bar.style.setProperty("--swipe-offset", `calc(${progress} * (100% + 6px))`);
      bar.style.setProperty("--swipe-stretch", String(1 + Math.sin(Math.abs(progress) * Math.PI) * .15));
    });
  }

  function finishSwipe(event: ReactPointerEvent<HTMLElement>) {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const direction = Math.sign(dx);
    const next = nav[viewIndex - direction]?.label;
    if (!start.horizontal || Math.abs(dx) < 18 || !next) {
      settleSwipe();
    } else {
      settleSwipe(next, direction);
    }
  }

  function tapMobileTab(event: ReactPointerEvent<HTMLButtonElement>, next: View) {
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (event.currentTarget.contains(target)) navigate(next);
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

  function confirmTrash(debt: Debt, action: "trash" | "purge") {
    setTrashError("");
    setTrashPrompt({ id: debt.id, action });
  }

  async function changeTrash(debt: Debt, action: TrashAction) {
    if (busy || !canTrash(debt)) return;
    setTrashError("");
    setBusy(true);
    try {
      if (debt.shared) {
        if (!userId || !client) return;
        const { data, error } = await client.rpc("pacta_debt_trash", { p_id: debt.id, p_action: action });
        if (error?.code === "PGRST202") {
          setTrashError("La papelera de deudas compartidas aún necesita activarse en Supabase.");
          return;
        }
        if (error || !data) throw error;
        if (action === "purge") {
          sharedRevision.current++;
          setShared((previous) => previous?.actor === userId
            ? { actor: userId, debts: previous.debts.filter((item) => item.id !== debt.id) }
            : previous);
        } else {
          storeSharedDebt(data, userId);
        }
        void refreshInbox();
      } else {
        const trashedAt = action === "trash" ? new Date().toISOString() : undefined;
        setLocalDebts((previous) => action === "purge"
          ? previous.filter((item) => item.id !== debt.id)
          : previous.map((item) => item.id === debt.id ? { ...item, trashedAt } : item));
      }
      setSelected(null);
      setTrashPrompt(null);
      setMessage(action === "trash" ? "Deuda movida a la papelera" : action === "restore" ? "Deuda restaurada" : "Deuda borrada definitivamente");
    } catch {
      setTrashError("No se pudo completar la operación. Comprueba si la deuda ha cambiado e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  function showGroup(name: string) {
    navigate("Social");
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
        return <DebtGesture key={debt.id} open={() => setSelected(debt.id)}
          trash={canTrash(debt) ? () => confirmTrash(debt, "trash") : undefined}>
          <span className={`tile ${kindColors[debt.kind]}`}><Icon size={20} /></span>
          <span className="row-copy"><strong>{debt.title}</strong><small>{debt.friend} · {(debt.shared ? social?.groups.find((item) => item.id === debt.group)?.name : debt.group) || "Sin grupo"}</small></span>
          <span className="row-value">
            <strong className={debt.stage === "Saldada" ? "muted" : debt.direction === "owed" ? "positive" : ""}>
              {debt.direction === "owed" ? "+" : "−"}{euros(debt.amount)}
            </strong>
            <small>{debt.stage === "Pendiente" ? debt.date : debt.stage}</small>
          </span>
          <ChevronRight className="row-chevron" size={16} />
        </DebtGesture>;
      }) : <p className="empty">Aquí aparecerán los movimientos.</p>}
    </div>;
  }

  function demoGroupList() {
    return <div className="group-list">{groups.map((item) => {
      const Icon = groupIcons[item.symbol];
      return <button key={item.name} className="group-row" onClick={() => showGroup(item.name)}>
        <span className={`tile ${item.color}`}><Icon size={21} /></span>
        <span className="row-copy"><strong>{item.name}</strong><small>{item.members.length} miembros</small></span>
        <ChevronRight className="row-chevron" size={16} />
      </button>;
    })}</div>;
  }

  function renderView(section: View, preview = false) {
    return section === "Inicio" ? <>
      <div className="page-heading">
        <div><h1>¡Hola, {firstName}!</h1></div>
        <button className="secondary home-add-debt" onClick={() => setDialog("new")}><Plus size={16} aria-hidden="true" /> Nueva deuda</button>
      </div>

      <section className="balance" aria-label="Resumen de saldo">
        <h2 className="balance-label"><span><Wallet size={17} /></span> Tu balance</h2>
        <div className="balance-grid">
          <div><span><ArrowDownLeft size={16} /> Te deben</span><strong>{euros(owed)}</strong></div>
          <div><span><ArrowUpRight size={16} /> Debes</span><strong>{euros(owe)}</strong></div>
        </div>
      </section>

      <div className="home-dashboard">
        <section>
          <div className="section-heading"><h2>Actividad reciente</h2><button onClick={() => navigate("Actividad")}>Ver todo <ArrowRight size={15} /></button></div>
          {debtList(debts.slice(0, 4))}
        </section>
      </div>
    </> : section === "Social" ? <>
      {!preview && group && <button className="back" onClick={() => setGroup(null)}>← Todos los grupos</button>}
      <div className="page-heading"><div><h1>{(!preview && groupName) || "Social"}</h1><p>{!preview && group ? "Las cuentas de vuestro grupo, en un solo lugar." : "Compartid planes y llevad las cuentas al día."}</p></div>
      <button className="primary heading-action" onClick={() => setDialog("new")}><Plus size={19} /> Nueva deuda</button></div>
      {!preview && groupName ? <>
        {realGroup?.owner && <button className="danger invitation-button" type="button"
          onClick={() => void deleteGroup(realGroup)}><Trash2 size={16} /> Borrar grupo</button>}
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
      </> : userId ? (social ? <SocialPanel data={social} run={runSocialAction} openGroup={showGroup} />
        : <p role="status">{socialUnavailableFor === userId ? "Amigos y grupos aún no están disponibles. Comprueba la configuración de Supabase." : "Cargando amigos y grupos…"}</p>)
        : <><button className="secondary invitation-button" onClick={() => setDialog("profile")}>Inicia sesión para añadir amigos y grupos</button>
          <div className="groups-page">{demoGroupList()}</div></>}
    </> : <>
      <div className="page-heading"><div><h1>Actividad</h1><p>Consulta tus deudas, propuestas y pagos.</p></div>
      <button className="primary heading-action" onClick={() => setDialog("new")}><Plus size={19} /> Nueva deuda</button></div>
      <button className="secondary invitation-button" aria-expanded={!preview && showTrash}
        onClick={() => { setTrashError(""); setShowTrash(!showTrash); }}>
        <Trash2 size={17} /> {!preview && showTrash ? "Volver a actividad" : `Papelera${trash.length ? ` (${trash.length})` : ""}`}
      </button>
      {!preview && showTrash ? <section aria-label="Papelera de deudas">
        <div className="section-heading"><h2>Papelera</h2></div>
        {!trashPrompt && trashError && <p role="alert">{trashError}</p>}
        <div className="debt-list">{trash.length ? trash.map((debt) =>
          <div key={debt.id} className="trash-row">
            <div className="row-copy"><strong>{debt.title}</strong><small>{debt.friend} · {euros(debt.amount)}</small></div>
            <div className="trash-actions">
              <button className="secondary" disabled={busy} onClick={() => void changeTrash(debt, "restore")}>Restaurar</button>
              <button className="danger" disabled={busy} onClick={() => confirmTrash(debt, "purge")}>Borrar definitivamente</button>
            </div>
          </div>
        ) : <p className="empty">La papelera está vacía.</p>}</div>
      </section> : <>
      <div className="filters" aria-label="Filtrar actividad">{(["Todo", "Pendientes", "Saldadas"] as const).map((item) =>
        <button key={item} aria-pressed={(preview ? "Todo" : filter) === item} className={(preview ? "Todo" : filter) === item ? "filter-active" : ""} onClick={() => setFilter(item)}>{item}</button>
      )}</div>
      {(preview ? debts : visibleDebts).some(canTrash) && <p className="trash-hint">Mantén pulsada una deuda para moverla a la papelera.</p>}
      {debtList(preview ? debts : visibleDebts)}
      </>}
    </>;
  }

  return (
    <div className="app-shell" data-view={view}>
      <aside className="sidebar">
        <button className="brand" onClick={() => setDialog("welcome")} aria-label="Bienvenida a Pacta">
          <span className="brand-mark"><CircleDollarSign aria-hidden="true" size={23} strokeWidth={2.1} /></span> pacta<span className="brand-dot">.</span>
        </button>
        <nav className="side-nav" aria-label="Navegación principal">
          {nav.map(({ label, icon: Icon }) =>
            <button key={label} className={view === label ? "nav-active" : ""} onClick={() => navigate(label)} aria-current={view === label ? "page" : undefined}>
              <Icon size={19} />{label}
              {label === "Social" && pendingSocial > 0 && <span className="group-request-count" aria-label={`${pendingSocial} solicitudes pendientes`}>{pendingSocial > 99 ? "99+" : pendingSocial}</span>}
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <AppearancePicker {...appearance} />
          <ShareAppButton className="help share-app-button" onClick={() => setDialog("shareApp")} />
          <button className="help" onClick={() => setDialog("welcome")}><CircleHelp size={19} /> Sobre Pacta</button>
          <button className="profile" onClick={() => setDialog("profile")} aria-label="Mi perfil"><span className="avatar">{initial}</span><span><strong>{profile.name}</strong><small>Mi espacio personal</small></span></button>
        </div>
      </aside>

      <main className="workspace" onPointerDown={startSwipe} onPointerMove={moveSwipe}
        onPointerUp={finishSwipe}
        onPointerCancel={(event) => { if (swipe.current?.id === event.pointerId) settleSwipe(); }}
        onLostPointerCapture={(event) => {
          if (event.target === event.currentTarget && swipe.current?.id === event.pointerId) settleSwipe();
        }}>
        <header className="topbar">
          <button className="brand mobile-brand" onClick={() => setDialog("welcome")} aria-label="Bienvenida a Pacta"><span className="brand-mark"><CircleDollarSign aria-hidden="true" size={21} /></span> pacta<span className="brand-dot">.</span></button>
          <span className="top-label">Mi espacio</span>
          <div className="top-actions">
            <button className="icon-button notification" aria-label={unread ? `Notificaciones (${unread} pendientes)` : "Notificaciones"} onClick={() => {
              setDialog("notifications"); void refreshInbox();
            }}><Bell size={19} />{unread > 0 && <span className="notification-count">{unread > 99 ? "99+" : unread}</span>}</button>
            {userId && <div className="message-area" ref={messageArea}>
              <button ref={messageButton} className="icon-button notification chat-menu-button" title="Chats"
                aria-label={inbox?.unread_messages ? `Chats (${inbox.unread_messages} sin leer)` : "Chats"}
                aria-expanded={dialog === "messages"} aria-controls="message-menu"
                onClick={() => {
                  setDialog(dialog === "messages" ? null : "messages");
                  if (dialog !== "messages") void refreshInbox();
                }}>
                <MessageCircle size={18} /><span>Chats</span><ChevronDown size={14} />
                {Boolean(inbox?.unread_messages) && <span className="notification-count" aria-hidden="true">
                  {(inbox?.unread_messages ?? 0) > 99 ? "99+" : inbox?.unread_messages}
                </span>}
              </button>
              {dialog === "messages" && <section id="message-menu" className="message-menu" aria-labelledby="message-menu-title">
                <h2 id="message-menu-title">Chats</h2>
                {client && <ChatDirectory key={userId} client={client} userId={userId}
                  conversations={inbox?.conversations ?? []} friends={social?.friends.filter((friend) => friend.accepted) ?? []}
                  groups={groupsForDebt} refreshKey={groupChatRevision} openFriend={openChat} openGroup={openGroupChat} />}
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
          <div className="swipe-viewport" ref={swipeViewport}>
            <div className="swipe-track" ref={swipeTrack} onTransitionEnd={(event) => {
              if (event.target === event.currentTarget && event.propertyName === "transform") finishSlide.current?.();
            }}>
              {nav.map(({ label }, index) => {
                const current = index === viewIndex;
                if (!current && (!touchNavigation || Math.abs(index - viewIndex) !== 1)) return null;
                return <div key={label} className={current ? "view-content" : "swipe-preview"}
                  data-direction={current ? viewDirection : undefined}
                  data-side={current ? undefined : index > viewIndex ? "right" : "left"}
                  inert={!current} aria-hidden={current ? undefined : true}>
                  {renderView(label, !current)}
                </div>;
              })}
            </div>
          </div>
        </div>
      </main>

      <nav ref={bottomNav} className="bottom-nav" aria-label="Navegación móvil">
        <button onPointerUp={(event) => tapMobileTab(event, "Inicio")} onClick={() => navigate("Inicio")} aria-current={view === "Inicio" ? "page" : undefined} className={view === "Inicio" ? "bottom-active" : ""}><LayoutGrid size={21} /> Inicio</button>
        <button onPointerUp={(event) => tapMobileTab(event, "Social")} onClick={() => navigate("Social")} aria-current={view === "Social" ? "page" : undefined} className={view === "Social" ? "bottom-active" : ""}><UsersRound size={21} /> Social{pendingSocial > 0 && <span className="group-request-count" aria-label={`${pendingSocial} solicitudes pendientes`}>{pendingSocial > 99 ? "99+" : pendingSocial}</span>}</button>
        <button onPointerUp={(event) => tapMobileTab(event, "Actividad")} onClick={() => navigate("Actividad")} aria-current={view === "Actividad" ? "page" : undefined} className={view === "Actividad" ? "bottom-active" : ""}><List size={22} /> Actividad</button>
      </nav>

      {((dialog && dialog !== "messages") || active || trashDebt || (chatTarget && client && userId)) && <Modal explicitClose={Boolean(chatTarget)} close={() => {
        setDialog(null); setSelected(null); setChatTarget(null); setTrashPrompt(null); setTrashError("");
      }}>
        {trashPrompt && trashDebt ? <>
          <h2 id="dialog-title">{trashPrompt.action === "purge" ? "¿Borrar definitivamente?" : "¿Mover a la papelera?"}</h2>
          <p className="dialog-description">{trashPrompt.action === "purge"
            ? `«${trashDebt.title}» se borrará para siempre.`
            : `«${trashDebt.title}» saldrá de la actividad y del saldo. Podrás restaurarla desde la papelera.`}
            {trashPrompt.action === "trash" && trashDebt.shared && " Si la compartiste, se retirará también para tu amigo."}
          </p>
          {trashError && <p className="dialog-description" role="alert">{trashError}</p>}
          <div className="dialog-actions">
            <button className="secondary" disabled={busy} onClick={() => { setTrashPrompt(null); setTrashError(""); }}>Cancelar</button>
            <button className="danger" disabled={busy} onClick={() => void changeTrash(trashDebt, trashPrompt.action)}>
              {trashPrompt.action === "purge" ? "Borrar definitivamente" : "Mover a la papelera"}
            </button>
          </div>
        </> : chatTarget && client && userId ? <ChatDialog key={`${userId}:${chatTarget.kind}:${chatTarget.id}`} client={client} userId={userId} target={chatTarget}
          trackRead={Boolean(inbox)} onChange={chatTarget.kind === "group" ? refreshGroupChats : refreshInbox} onClose={() => setChatTarget(null)} />
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
        </> : dialog === "shareApp" ? <ShareAppDialog />
          : (dialog === "profile" || dialog === "register" || dialog === "access") ? <ProfileDialog
          profile={profile} mobileSettings={<>
            <AppearancePicker {...appearance} />
            <ShareAppButton className="secondary share-app-button" onClick={() => setDialog("shareApp")} />
          </>} initialMode={dialog === "access" ? "access" : dialog === "register" ? "register" : invite ? "login" : "profile"} /> : dialog === "welcome" ? <div className="welcome">
          <span className="brand-mark"><CircleDollarSign aria-hidden="true" size={39} /></span>
          <h2 id="dialog-title">Bienvenido a PACTA<span className="brand-dot">.</span></h2>
          <p>Comparte gastos y salda cuentas a vuestra manera. Elegid entre dinero, comida, bebidas, favores y otras recompensas.</p>
          <button className="primary" onClick={() => { setDialog(null); navigate("Inicio"); }}>Entrar a Pacta <ArrowRight size={18} /></button>
        </div> : dialog === "new" ? <>
          <h2 id="dialog-title">Nueva deuda</h2><p className="dialog-description">Añade un gasto compartido o algo que quedó pendiente.</p>
          <NewDebtForm friends={friendsForDebt} onlineGroups={groupsForDebt} userId={userId}
            initialGroup={group} usingShared={usingShared} disabled={busy || profile.loading} save={addDebt} />
        </> : dialog === "notifications" ? <Notifications deviceSettings={client && userId ? <MobilePush key={userId} client={client} userId={userId} /> : undefined} pending={unread} requests={pendingSocial} proposals={proposals}
          messages={inbox?.conversations.filter((item) => item.unread_count > 0) ?? []} notices={notices}
          openChat={openChat} openDebt={openDebtNotice} openProposal={openProposal} markRead={markDebtNotices}
          openRequests={() => { setDialog(null); navigate("Social"); }} /> : active && <DebtDetail key={active.id} debt={active} update={updateDebt} remove={(debt) => confirmTrash(debt, "trash")} busy={busy} shareInvitation={shareInvitation} />}
      </Modal>}
      <div role="status" className={message ? "toast shown" : "toast"}>{message && <><Check size={17} />{message}</>}</div>
    </div>
  );
}

function Modal({ children, close, explicitClose = false }: { children: React.ReactNode; close: () => void; explicitClose?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return <dialog ref={ref}
    className="modal" aria-labelledby="dialog-title"
    onCancel={(event) => { event.preventDefault(); if (!explicitClose) close(); }}
    onClick={(event) => { if (!explicitClose && event.target === event.currentTarget) close(); }}>
    <div className="modal-content">
      <button className="icon-button close" onClick={close} aria-label="Cerrar"><X size={21} /></button>
      {children}
    </div>
  </dialog>;
}

function DebtDetail({ debt, update, remove, busy, shareInvitation }: {
  debt: Debt;
  update: (value: Partial<Debt>, notice: string) => void;
  remove: (debt: Debt) => void;
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
    {canTrash(debt) && <div className="dialog-actions debt-delete-actions">
      <button className="danger" disabled={busy} onClick={() => remove(debt)}>Mover a la papelera</button>
    </div>}
  </>;
}
