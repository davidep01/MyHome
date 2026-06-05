import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { app } from './app.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3001)
const DIST = join(__dirname, '../../dist')

/** First non-internal IPv4 address — the address other LAN devices should use. */
function lanAddress(): string | null {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address
    }
  }
  return null
}

// Serve built React app (production only)
if (existsSync(DIST)) {
  app.use('/*', serveStatic({
    root: DIST,
    onFound: (path, c) => {
      // Entry points must always revalidate so a new build is picked up on the
      // next load (critical for Fully Kiosk, which keeps a tab open for days).
      // Content-hashed assets are safe to cache forever.
      if (/(?:sw\.js|registerSW\.js|index\.html|\.webmanifest)$/.test(path)) {
        c.header('Cache-Control', 'no-cache, no-store, must-revalidate')
      } else if (/\.(?:js|css|woff2?|png|svg|ico|jpe?g)$/.test(path)) {
        c.header('Cache-Control', 'public, max-age=31536000, immutable')
      }
    },
  }))
  app.get('*', (c) => {
    return c.html(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/"></head></html>`)
  })
}

// hostname '0.0.0.0' binds every interface so the dashboard is reachable across the LAN.
serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, () => {
  const lan = lanAddress()
  console.log(`🏠 MyHome backend in ascolto:`)
  console.log(`   • locale:  http://localhost:${PORT}`)
  if (lan) console.log(`   • LAN:     http://${lan}:${PORT}   ← apri questo dai tablet/telefoni`)
})
