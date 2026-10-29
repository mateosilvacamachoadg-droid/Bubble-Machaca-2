// Permite instalar Bubble y abrirla aunque falle el internet un momento.
const VERSION = 'bubble-v5';
const BASE = ['./', 'index.html', 'estilos.css', 'app.js', 'burbuja.js', 'gemini.js', 'chart.umd.js', 'manifest.webmanifest', 'iconos/icono.svg', 'iconos/icono-192.png', 'iconos/icono-512.png', 'iconos/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  // Primero internet (para tener siempre lo más nuevo); si no hay, lo guardado.
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
