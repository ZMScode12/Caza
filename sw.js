/* Caza service worker — network-first.
   Always fetches the latest files when online; falls back to cache only
   when offline. So after you deploy, users just reopen the app — no
   unregister needed. */
const CACHE = 'caza-v2';
const CORE = [
  '/',
  '/index.html',
  '/pwa/manifest.json',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE).catch(()=>{}))   // don't fail install if one asset 404s
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // let Supabase / cross-origin calls hit the network directly
  if (!req.url.startsWith(self.location.origin)) return;

  // navigations (opening the app, refreshing) -> always resolve to index.html
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then(r => r || caches.match('/')))
    );
    return;
  }

  // everything else: network-first, cache as we go, cache fallback offline
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      })
      .catch(() => caches.match(req))
  );
});

/* ---------- push notifications ---------- */
self.addEventListener('push', function(e){
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch(_) { data = { body: (e.data && e.data.text()) || '' }; }
  const title = data.title || 'Caza';
  const opts = {
    body: data.body || '',
    icon: '/pwa/icon-192.png',
    badge: '/pwa/icon-192.png',
    tag: data.tag || 'caza-msg',
    data: { url: data.url || '/' }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(list){
      for (const c of list){ if ('focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
