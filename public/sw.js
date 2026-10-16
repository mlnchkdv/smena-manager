self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: 'Smena Manager', body: event.data?.text() || '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Smena Manager', {
      body: data.body || '',
      icon: data.icon || '/favicon.svg',
      badge: data.badge || '/favicon.svg',
      tag: data.tag,
      data: { url: data.url || '/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/notifications', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(client => client.url.startsWith(self.location.origin));
      if (existing) return existing.navigate(target).then(client => client.focus());
      return self.clients.openWindow(target);
    }),
  );
});
