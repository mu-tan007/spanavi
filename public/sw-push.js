// Push event handler
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Spanavi', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Spanavi';
  const options = {
    body: data.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: { url: data.url || '/' },
    tag: data.type || 'default',
    requireInteraction: data.type === 'test', // テスト時は明示的に閉じるまで残す
  };

  // 全クライアントに postMessage（DevTools で受信確認用）
  const notifyClients = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => {
      clients.forEach(c => c.postMessage({ kind: 'push-received', data, time: new Date().toISOString() }));
    })
    .catch(() => {});

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      notifyClients,
    ])
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
