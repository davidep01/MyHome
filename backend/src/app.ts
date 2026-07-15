import './env.js'
import { Hono } from 'hono'
import { compress } from 'hono/compress'
import { bodyLimit } from 'hono/body-limit'
import { configRouter } from './routes/config.js'
import { roomsRouter } from './routes/rooms.js'
import { entitiesRouter } from './routes/entities.js'
import { weatherRouter } from './routes/weather.js'
import { newsRouter } from './routes/news.js'
import { haRouter } from './routes/ha.js'
import { aiRouter } from './routes/ai.js'
import { layoutRouter } from './routes/layout.js'
import { systemRouter } from './routes/system.js'
import { authRouter } from './routes/auth.js'
import { screensaverRouter } from './routes/screensaver.js'
import { alarmRouter } from './routes/alarm.js'
import { kioskRouter } from './routes/kiosk.js'
import { authenticateRequest, authConfiguration } from './lib/security.js'
import { db } from './db/client.js'
import { safeRequestLogger } from './lib/request-logger.js'
import { enforceAllowedHost } from './lib/host-guard.js'

export const app = new Hono()

app.use('*', enforceAllowedHost)
app.use('*', safeRequestLogger)
app.use('*', compress({ threshold: 1_024 }))
app.use('/api/*', bodyLimit({
  maxSize: 8 * 1_024 * 1_024,
  onError: (c) => c.json({ error: 'Richiesta troppo grande' }, 413),
}))
app.use('/api/*', async (c, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
    const contentType = c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase()
    if (contentType !== 'application/json') return c.json({ error: 'Content-Type deve essere application/json' }, 415)
  }
  await next()
})
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  c.header('Content-Security-Policy', "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:")
  await next()
})
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  await next()
})
app.use('/api/*', authenticateRequest)

app.route('/api/auth', authRouter)
app.route('/api/config', configRouter)
app.route('/api/layout', layoutRouter)
app.route('/api/rooms', roomsRouter)
app.route('/api/rooms/:roomId/entities', entitiesRouter)
app.route('/api/weather', weatherRouter)
app.route('/api/news', newsRouter)
app.route('/api/ha', haRouter)
app.route('/api/ai', aiRouter)
app.route('/api/system', systemRouter)
app.route('/api/screensaver', screensaverRouter)
app.route('/api/alarm', alarmRouter)
app.route('/api/kiosk', kioskRouter)

app.get('/api/health', async (c) => {
  const auth = authConfiguration()
  let storage: 'ok' | 'error' = 'ok'
  try {
    await Promise.race([
      db.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('storage timeout')), 2_000)),
    ])
  } catch {
    storage = 'error'
  }
  const healthy = auth.mode !== 'misconfigured' && storage === 'ok'
  return c.json({
    status: healthy ? 'ok' : 'degraded',
    auth: auth.mode,
    storage,
    ts: Date.now(),
  }, healthy ? 200 : 503)
})

app.notFound((c) => c.json({ error: 'Endpoint non trovato' }, 404))
app.onError((error, c) => {
  // Error objects produced by fetch can embed the complete target URL. Keep
  // diagnostics useful without risking signed HA URLs or tokens in logs.
  console.error('[api] errore non gestito', error instanceof Error ? error.name : 'UnknownError')
  return c.json({ error: 'Errore interno del server' }, 500)
})

export default app
