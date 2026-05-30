import { Hono } from 'hono'
import Parser from 'rss-parser'
import { db } from '../db/client.js'

const DEFAULT_FEED = 'https://www.ansa.it/sito/ansait_rss.xml'
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

export const newsRouter = new Hono()

async function feedUrl(queryUrl: string | undefined): Promise<string> {
  return queryUrl || (await db.read()).config.newsFeedUrl || process.env.NEWS_RSS_URL || DEFAULT_FEED
}

newsRouter.get('/', async (c) => {
  try {
    const feed = await parser.parseURL(await feedUrl(c.req.query('feedUrl')))
    return c.json(feed.items.slice(0, 20).map((item: RssItemWithImage, index) => {
      const publishedAt = item.isoDate ?? item.pubDate ?? new Date().toISOString()
      return {
        id: item.guid ?? item.link ?? `${index}-${publishedAt}`,
        title: item.title ?? 'Senza titolo',
        description: item.contentSnippet ?? item.content ?? null,
        url: item.link ?? '',
        source: feed.title ?? '',
        publishedAt,
        urlToImage: item.enclosure?.url ?? null,
      }
    }))
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'RSS feed error' }, 502)
  }
})
