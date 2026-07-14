/* MyHome no longer uses a Service Worker. This one-shot migration worker
   replaces legacy PWA workers, clears their caches and unregisters itself. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.map((name) => caches.delete(name)))
    await self.registration.unregister()
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    await Promise.all(windows.map((client) => client.navigate(client.url)))
  })())
})
