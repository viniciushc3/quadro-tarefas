/* Service Worker — cache do "shell" do app (PWA offline).
   Troque a versão para forçar atualização nos aparelhos. */
const VERSAO = 'quadrinho-v6';
const ARQUIVOS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './sounds.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                        // POST da API nunca é cacheado
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;         // chamadas ao Apps Script passam direto

  // Stale-while-revalidate: responde do cache na hora e atualiza em segundo plano.
  e.respondWith(
    caches.match(req).then(cacheado => {
      const rede = fetch(req).then(resp => {
        if (resp && resp.ok) caches.open(VERSAO).then(c => c.put(req, resp.clone()));
        return resp;
      }).catch(() => cacheado || caches.match('./index.html'));
      return cacheado || rede;
    })
  );
});
