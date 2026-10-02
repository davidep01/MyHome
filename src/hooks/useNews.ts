import { useQuery } from '@tanstack/react-query'
import { fetchTopNews } from '../api/news'

export function useNews(category = 'technology') {
  return useQuery({
    queryKey: ['news', category],
    queryFn: ({ signal }) => fetchTopNews(category, 'it', signal),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  })
}
