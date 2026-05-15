const BASE = '/api/news'

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
  const params = new URLSearchParams({ category, country })
  const res = await fetch(`${BASE}?${params}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<NewsArticle[]>
}
