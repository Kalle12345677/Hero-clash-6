'use strict';

const CACHE = 'hero-clash-shell-v5';
const SHELL = ['/', '/app.js', '/styles.css', '/socket.io/socket.io.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new Request(path, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('hero-clash-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const key = request.mode === 'navigate' && ['/', '/index.html'].includes(url.pathname) ? '/' : url.pathname;
  if (!SHELL.includes(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(key, response.clone());
        return response;
      }
      return (await cache.match(key)) || response;
    } catch {
      return (await cache.match(key)) || Response.error();
    }
  })());
});
