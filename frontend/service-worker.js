const V = 'hydradl-v1', SHELL = ['./', 'index.html', 'manifest.json', 'css/app.css', 'js/app.js', 'js/api.js', 'js/db.js', 'js/icons.js', 'icons/icon.svg', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/') || (u.origin !== location.origin && !/fonts\.(googleapis|gstatic)\.com/.test(u.host))) return; // never cache bridge calls
  e.respondWith(caches.match(e.request).then(hit => { const net = fetch(e.request).then(r => { if (r.ok) caches.open(V).then(c => c.put(e.request, r.clone())); return r; }).catch(() => hit || caches.match('index.html')); return hit || net; }));
});
