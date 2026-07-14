/** Removes workers/caches left by pre-LAN MyHome PWA releases. */
export async function cleanupLegacyServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map(async (registration) => {
      try { await registration.update() } catch { /* offline: unregister below */ }
      await registration.unregister()
    }))
    if ('caches' in window) {
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name)))
    }
  } catch {
    // Private/locked-down WebViews can deny storage APIs; app startup must not.
  }
}
