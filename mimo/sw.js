// MiMo Remote — service worker: nhận thông báo đẩy (không kèm nội dung khách)
// Bản đăng nhập Google: không tự đọc dữ liệu ở đây, chỉ báo chung "có tin chờ duyệt".
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", (e) =>
  e.waitUntil(
    self.registration.showNotification("MiMo: có tin chờ duyệt", {
      body: "Mở để xem tin nháp và bấm Gửi.",
      tag: "mimo",
      renotify: true,
      icon: "icon-192.png",
      badge: "icon-192.png",
    })
  )
);
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const ws = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of ws) if (w.url.includes("/mimo/")) return w.focus();
    return self.clients.openWindow("./");
  })());
});
