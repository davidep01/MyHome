const NEWS_KEY = import.meta.env.VITE_NEWS_API_KEY ?? ''
const BASE = 'https://newsapi.org/v2'

export interface NewsArticle {
  id: string
  title: string
  description: string | null
  url: string
  source: string
  publishedAt: string
  urlToImage: string | null
}

export async function fetchTopNews(
  category = 'technology',
  country = 'it',
): Promise<NewsArticle[]> {
  const res = await fetch(
    `${BASE}/top-headlines?category=${category}&country=${country}&pageSize=20&apiKey=${NEWS_KEY}`,
  )
  if (!res.ok) throw new Error('NewsAPI error')
  const d = await res.json()
  return (d.articles ?? []).map((a: any, i: number) => ({
    id: `${i}-${a.publishedAt}`,
    title: a.title,
    description: a.description,
    url: a.url,
    source: a.source?.name ?? '',
    publishedAt: a.publishedAt,
    urlToImage: a.urlToImage,
  }))
}
