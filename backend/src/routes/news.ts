import { Hono } from 'hono'
import { db } from '../db/client.js'

const BASE = 'https://newsapi.org/v2'

interface NewsApiArticle {
  title: string
  description: string | null
  url: string
  source?: { name?: string }
  publishedAt: string
  urlToImage: string | null
}

interface NewsApiResponse {
  articles?: NewsApiArticle[]
}

export const newsRouter = new Hono()

function newsKey(): string {
  return process.env.NEWS_API_KEY ?? process.env.VITE_NEWS_API_KEY ?? ''
}

function assertConfigured() {
  const key = newsKey()
  if (!key || key.startsWith('your_')) {
    throw new Error('NewsAPI key missing')
  }
  return key
}

newsRouter.get('/', async (c) => {
  try {
    const config = db.read().config
    const category = c.req.query('category') || config.newsCategory || 'technology'
    const country = c.req.query('country') || 'it'
    const url = new URL(`${BASE}/top-headlines`)
    url.searchParams.set('category', category)
    url.searchParams.set('country', country)
    url.searchParams.set('pageSize', '20')
    url.searchParams.set('apiKey', assertConfigured())

    const res = await fetch(url)
    if (!res.ok) {
      const message = await res.text()
      throw new Error(`NewsAPI ${res.status}: ${message}`)
    }

    const d = await res.json() as NewsApiResponse
    return c.json((d.articles ?? []).map((article, index) => ({
      id: `${index}-${article.publishedAt}`,
      title: article.title,
      description: article.description,
      url: article.url,
      source: article.source?.name ?? '',
      publishedAt: article.publishedAt,
      urlToImage: article.urlToImage,
    })))
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'News API error' }, 502)
  }
})
