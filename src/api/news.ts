import { request } from './backend'

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
  signal?: AbortSignal,
): Promise<NewsArticle[]> {
  const params = new URLSearchParams({ category, country })
  return request(`/news?${params}`, { signal })
}
