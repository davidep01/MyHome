import './env.js'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { configRouter } from './routes/config.js'
import { roomsRouter } from './routes/rooms.js'
import { entitiesRouter } from './routes/entities.js'
import { weatherRouter } from './routes/weather.js'
import { newsRouter } from './routes/news.js'
import { haRouter } from './routes/ha.js'
import { aiRouter } from './routes/ai.js'
import { layoutRouter } from './routes/layout.js'
import { systemRouter } from './routes/system.js'

export const app = new Hono()

app.use('*', logger())
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-MyHome-Client'],
}))

app.route('/api/config', configRouter)
app.route('/api/layout', layoutRouter)
app.route('/api/rooms', roomsRouter)
app.route('/api/rooms/:roomId/entities', entitiesRouter)
app.route('/api/weather', weatherRouter)
app.route('/api/news', newsRouter)
app.route('/api/ha', haRouter)
app.route('/api/ai', aiRouter)
app.route('/api/system', systemRouter)

app.get('/api/health', (c) => c.json({ status: 'ok', ts: Date.now() }))

export default app
