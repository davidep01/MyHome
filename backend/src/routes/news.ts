import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { Hono } from 'hono'
import Parser from 'rss-parser'
import { db } from '../db/client.js'
import {
  BoundedTtlCache,
  OutboundRequestError,
  fetchWithLimits,
  isPrivateOrReservedAddress,
  stripControlCharacters,
} from '../lib/request-safety.js'

const DEFAULT_FEED = 'https://www.ansa.it/sito/ansait_rss.xml'
const FEED_TTL_MS = 15 * 60 * 1_000
const MAX_FEED_BYTES = 1_000_000
const MAX_IMAGE_BYTES = 4 * 1_024 * 1_024
const SAFE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'])
const parser = new Parser()

interface RssItemWithImage {
  title?: string
  contentSnippet?: string
  content?: string
  link?: string
  guid?: string
  pubDate?: string
  isoDate?: string
  enclosure?: { url?: string }
}

interface NewsArticle {
  id: string
  title: string
  description: string | null
  url: string
  source: string
  publishedAt: string
  urlToImage: string | null
}

export const newsRouter = new Hono()
const feedCache = new BoundedTtlCache<NewsArticle[]>(8)
const imageCache = new BoundedTtlCache<{ url: string; allowedHosts: ReadonlySet<string> }>(160)
const pendingFeeds = new Map<string, Promise<NewsArticle[]>>()

async function configuredFeedUrl(): Promise<string> {
  const stored = (await db.read()).config.newsFeedUrl?.trim()
  const fromEnv = process.env.NEWS_RSS_URL?.trim()
  return fromEnv || stored || DEFAULT_FEED
}

function configuredExtraHosts(variable: 'NEWS_RSS_ALLOWED_HOSTS' | 'NEWS_IMAGE_ALLOWED_HOSTS'): string[] {
  return (process.env[variable] ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase().replace(/\.$/, ''))
    .filter((host) => /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host))
}

function hostnameOfHttpsUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('unsafe')
    return url.hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    throw new OutboundRequestError('unsafe_url')
  }
}

/** Redirects are host-allowlisted; the configured/default host is mandatory. */
function allowedFeedHosts(feedUrl: string): ReadonlySet<string> {
  return new Set([hostnameOfHttpsUrl(feedUrl), ...configuredExtraHosts('NEWS_RSS_ALLOWED_HOSTS')])
}

function allowedImageHosts(feedUrl: string): ReadonlySet<string> {
  return new Set([hostnameOfHttpsUrl(feedUrl), ...configuredExtraHosts('NEWS_IMAGE_ALLOWED_HOSTS')])
}

function registerImage(url: string, hosts: ReadonlySet<string>): string | null {
  if (!url || !hosts.has(hostnameOfHttpsUrl(url))) return null
  const key = createHash('sha256').update(url).digest('base64url')
  imageCache.set(key, { url, allowedHosts: hosts }, FEED_TTL_MS)
  return `/api/news/image/${key}`
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<[^>]*>/g, ' ')
    .split(/\r?\n/).map(stripControlCharacters).join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function safeExternalUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2_048) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return ''
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (
      hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || hostname.endsWith('.internal')
      || hostname.endsWith('.home.arpa')
      || (!hostname.includes('.') && isIP(hostname) === 0)
      || (isIP(hostname) !== 0 && isPrivateOrReservedAddress(hostname))
    ) return ''
    return url.toString()
  } catch {
    return ''
  }
}

function publishedDate(item: RssItemWithImage): string {
  const raw = item.isoDate ?? item.pubDate
  const timestamp = typeof raw === 'string' ? Date.parse(raw) : Number.NaN
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString()
}

async function loadFeed(feedUrl: string): Promise<NewsArticle[]> {
  const cached = feedCache.get(feedUrl)
  if (cached) return cached
  const existing = pendingFeeds.get(feedUrl)
  if (existing) return existing
  if (pendingFeeds.size >= 8) throw new OutboundRequestError('network')

  const task = (async () => {
    const { response, bytes, finalUrl } = await fetchWithLimits(
      feedUrl,
      {
        method: 'GET',
        headers: {
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9',
          'User-Agent': 'MyHome/1.0 RSS reader',
        },
      },
      {
        timeoutMs: 8_000,
        maxBytes: MAX_FEED_BYTES,
        maxRedirects: 3,
        requirePublicHttps: true,
        allowedHosts: allowedFeedHosts(feedUrl),
      },
    )
    if (!response.ok) throw new OutboundRequestError('network')
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType && !/(?:rss|atom|xml|text\/plain)/.test(contentType)) {
      throw new OutboundRequestError('invalid_response')
    }

    let xml: string
    try {
      xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new OutboundRequestError('invalid_response')
    }
    const feed = await parser.parseString(xml)
    const source = cleanText(feed.title, 100)
    const imageHosts = allowedImageHosts(finalUrl.toString())
    const articles = feed.items.slice(0, 20).map((item: RssItemWithImage, index): NewsArticle => {
      const publishedAt = publishedDate(item)
      const link = safeExternalUrl(item.link)
      const id = cleanText(item.guid, 240) || link || `${index}-${publishedAt}`
      const description = cleanText(item.contentSnippet ?? item.content, 600)
      return {
        id,
        title: cleanText(item.title, 240) || 'Senza titolo',
        description: description || null,
        url: link,
        source,
        publishedAt,
        urlToImage: registerImage(safeExternalUrl(item.enclosure?.url), imageHosts),
      }
    })
    feedCache.set(feedUrl, articles, FEED_TTL_MS)
    return articles
  })().finally(() => pendingFeeds.delete(feedUrl))

  pendingFeeds.set(feedUrl, task)
  return task
}

newsRouter.get('/', async (c) => {
  if (c.req.query('feedUrl') !== undefined) {
    return c.json({ error: 'Il feed RSS si configura nelle Funzioni, non nella richiesta' }, 400)
  }
  try {
    const articles = await loadFeed(await configuredFeedUrl())
    c.header('Cache-Control', 'private, max-age=60')
    return c.json(articles)
  } catch (error) {
    if (error instanceof OutboundRequestError && error.reason === 'unsafe_url') {
      return c.json({ error: 'Feed RSS non consentito: usa un URL HTTPS pubblico' }, 400)
    }
    if (error instanceof OutboundRequestError && error.reason === 'timeout') {
      return c.json({ error: 'Il feed RSS non ha risposto in tempo' }, 504)
    }
    return c.json({ error: 'Feed RSS temporaneamente non disponibile' }, 502)
  }
})

newsRouter.get('/image/:key', async (c) => {
  const key = c.req.param('key')
  if (!/^[A-Za-z0-9_-]{43}$/.test(key)) return c.json({ error: 'Immagine non valida' }, 400)
  const registered = imageCache.get(key)
  if (!registered) return c.json({ error: 'Immagine non disponibile' }, 404)

  try {
    const { response, bytes } = await fetchWithLimits(
      registered.url,
      { method: 'GET', headers: { Accept: 'image/jpeg,image/png,image/gif,image/webp,image/avif' } },
      {
        timeoutMs: 8_000,
        maxBytes: MAX_IMAGE_BYTES,
        maxRedirects: 2,
        requirePublicHttps: true,
        allowedHosts: registered.allowedHosts,
      },
    )
    const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? ''
    if (!response.ok || !SAFE_IMAGE_TYPES.has(contentType) || bytes.byteLength === 0) {
      return c.json({ error: 'Immagine non disponibile' }, 502)
    }
    const body = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(body).set(bytes)
    return new Response(body, {
      headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    if (error instanceof OutboundRequestError && error.reason === 'timeout') {
      return c.json({ error: 'L’immagine non ha risposto in tempo' }, 504)
    }
    return c.json({ error: 'Immagine non disponibile' }, 502)
  }
})

export const newsSecurityInternals = { configuredFeedUrl, allowedFeedHosts, allowedImageHosts, registerImage }
