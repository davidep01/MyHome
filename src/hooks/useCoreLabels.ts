import { useQuery } from '@tanstack/react-query'
import { homeAiApi } from '../api/homeAi'

/** Etichette leggibili delle entità del catalogo del core. */
export function useCoreLabels(): (entityId: string) => string {
  const { data } = useQuery({ queryKey: ['home-ai', 'candidates'], queryFn: homeAiApi.candidates, staleTime: 60_000 })
  const map = new Map<string, string>()
  for (const entry of data?.candidates ?? []) map.set(entry.entity_id, entry.label)
  for (const entry of data?.catalog ?? []) map.set(entry.entity_id, entry.label)
  return (id: string) => map.get(id) ?? id
}
