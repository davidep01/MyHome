import { useQuery } from '@tanstack/react-query'
import { fetchTopNews } from '../api/news'

export function useNews(category = 'technology') {
  return useQuery({
    queryKey: ['news', category],
    queryFn: () => fetchTopNews(category),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  })
}
