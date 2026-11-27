import { timingSafeEqual } from "node:crypto";
import { sendNotification, WebPushError } from "web-push";

export const runtime = "nodejs";

const messages = {
  message: { title: "Nuevo mensaje", body: "Has recibido un mensaje privado.", section: "messages" },
  group_message: { title: "Nuevo mensaje de grupo", body: "Hay un mensaje nuevo en uno de tus grupos.", section: "messages" },
  debt: { title: "Novedad en una deuda", body: "Abre Pacta para ver el cambio.", section: "notifications" },
  request: { title: "Solicitud de amistad", body: "Alguien quiere añadirte como amigo.", section: "requests" },
  group_invite: { title: "Invitación a un grupo", body: "Te han invitado a un grupo de Pacta.", section: "requests" },
} as const;

const debtEvents = {
  new: { title: "Nueva deuda", body: "Han registrado una deuda contigo." },
  joined: { title: "Invitación aceptada", body: "Han aceptado tu invitación a compartir una deuda." },
  proposal: { title: "Nueva propuesta de deuda", body: "Te han enviado una propuesta para saldar una deuda." },
  accepted: { title: "Propuesta aceptada", body: "Han aceptado tu propuesta para saldar la deuda." },
  rejected: { title: "Propuesta rechazada", body: "Han rechazado tu propuesta para saldar la deuda." },
  settled: { title: "Deuda saldada", body: "Se ha confirmado que una deuda está saldada." },
} as const;

function validEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.port && !url.username && !url.password && !url.hash && (
      (url.hostname === "fcm.googleapis.com" && url.pathname.startsWith("/fcm/send/")) ||
      (url.hostname === "updates.push.services.mozilla.com" && url.pathname.startsWith("/wpush/")) ||
      url.hostname === "web.push.apple.com" ||
      url.hostname.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const secret = process.env.PACTA_PUSH_WEBHOOK_SECRET;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!secret || !publicKey || !privateKey || !subject) return new Response(null, { status: 503 });

  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return new Response(null, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const { endpoint, p256dh, auth, kind, id, debt_event: debtEvent } = payload ?? {};
  if (!validEndpoint(endpoint) || typeof p256dh !== "string" || !/^[\w-]{87}$/.test(p256dh)
    || typeof auth !== "string" || !/^[\w-]{22}$/.test(auth)
    || typeof kind !== "string" || !Object.hasOwn(messages, kind)
    || typeof id !== "string" || !/^[\w:-]{1,100}$/.test(id)) {
    return new Response(null, { status: 400 });
  }

  const message = messages[kind as keyof typeof messages];
  const details = kind === "debt" && typeof debtEvent === "string" && Object.hasOwn(debtEvents, debtEvent)
    ? debtEvents[debtEvent as keyof typeof debtEvents]
    : message;
  try {
    await sendNotification({ endpoint, keys: { p256dh, auth } }, JSON.stringify({
      title: details.title,
      body: details.body,
      section: message.section,
      tag: `${kind}:${id}`,
    }), { vapidDetails: { subject, publicKey, privateKey }, TTL: 3600, timeout: 3500 });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof WebPushError && [404, 410].includes(error.statusCode)) {
      return new Response(null, { status: 410 });
    }
    return new Response(null, { status: 502 });
  }
}
