import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { app } from './app.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3001)
const DIST = join(__dirname, '../../dist')

// Serve built React app (production only)
if (existsSync(DIST)) {
  app.use('/*', serveStatic({ root: DIST }))
  app.get('*', (c) => {
    return c.html(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/"></head></html>`)
  })
}

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`🏠 MyHome backend running on http://localhost:${PORT}`)
})
