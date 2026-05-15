import './env.js'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { configRouter } from './routes/config.js'
import { roomsRouter } from './routes/rooms.js'
import { entitiesRouter } from './routes/entities.js'
import { weatherRouter } from './routes/weather.js'
import { newsRouter } from './routes/news.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3001)
const DIST = join(__dirname, '../../dist')

const app = new Hono()

app.use('*', logger())
app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }))

// API routes
app.route('/api/config', configRouter)
app.route('/api/rooms', roomsRouter)
app.route('/api/rooms/:roomId/entities', entitiesRouter)
app.route('/api/weather', weatherRouter)
app.route('/api/news', newsRouter)

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', ts: Date.now() }))

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
