self.addEventListener("push", (event) => {
  if (!event.data) return;

  const { title, body, section, tag } = event.data.json();
  event.waitUntil(self.registration.showNotification(title ?? "PACTA", {
    body,
    tag,
    icon: "/app-icon/192",
    data: { section },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL("/", self.location.origin);
  url.searchParams.set("aviso", { requests: "solicitudes", messages: "mensajes" }[event.notification.data?.section] ?? "notificaciones");

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const window of windows) {
      if (new URL(window.url).origin !== url.origin) continue;
      const focused = await window.focus().catch(() => null);
      if (focused && await focused.navigate(url.href).catch(() => null)) return;
    }
    await self.clients.openWindow(url.href);
  })());
});
