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

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      clients.forEach(client => client.postMessage({ type: 'smena:push-subscription-change' }));
    }),
  );
});

const OFFLINE_CACHE = 'smena-offline-shell-__OFFLINE_BUILD__';
async function cacheOfflineShell() {
  const response = await fetch('/offline-assets.json', { cache: 'no-store' });
  if (!response.ok) throw Error('Offline manifest unavailable');
  const paths = await response.json();
  if (!Array.isArray(paths) || paths.some(path => !/^\/(?:assets\/[^?]+|offline\.html|favicon\.svg)$/.test(path))) throw Error('Invalid offline manifest');
  const cache = await caches.open(OFFLINE_CACHE);
  await cache.addAll(paths);
}
self.addEventListener('install', event => {
  event.waitUntil(cacheOfflineShell().then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('smena-offline-shell-') && key !== OFFLINE_CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate')
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(OFFLINE_CACHE);
        return (await cache.match('/offline.html')) || Response.error();
      }),
    );
  else if (url.pathname.startsWith('/assets/'))
    event.respondWith(
      (async () => {
        const cache = await caches.open(OFFLINE_CACHE);
        return (await cache.match(event.request, { ignoreVary: true })) || fetch(event.request);
      })(),
    );
});
