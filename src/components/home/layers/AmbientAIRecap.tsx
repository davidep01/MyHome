import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { aiApi } from '../../../api/ai'
import { buildScreensaverRecapInput } from '../../../lib/screensaverRecap'
import { useEntityStore } from '../../../store/entities'

const RECAP_REFRESH_MS = 5 * 60_000

export function AmbientAIRecap() {
  const [input, setInput] = useState(() => buildScreensaverRecapInput(useEntityStore.getState().entities))

  useEffect(() => {
    const refresh = () => {
      const next = buildScreensaverRecapInput(useEntityStore.getState().entities)
      setInput((current) => current.signature === next.signature ? current : next)
    }
    refresh()
    const interval = window.setInterval(refresh, RECAP_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [])

  const recap = useQuery({
    queryKey: ['screensaver-ai-recap', input.signature],
    queryFn: () => aiApi.recap(input.context),
    enabled: input.context.length > 0,
    staleTime: RECAP_REFRESH_MS,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })

  const aiText = recap.data?.trim()
  const text = aiText || input.localText
  const label = aiText ? 'Recap AI' : recap.isError ? 'Recap casa' : 'Recap AI'

  return (
    <section
      className="absolute bottom-[max(28px,env(safe-area-inset-bottom))] left-[max(28px,env(safe-area-inset-left))] z-10 w-[min(42vw,520px)] min-w-[300px] rounded-[22px] border border-white/15 bg-black/35 px-5 py-4 text-left shadow-[0_14px_48px_rgba(0,0,0,.24)] backdrop-blur-2xl max-sm:bottom-auto max-sm:top-[max(24px,env(safe-area-inset-top))] max-sm:w-[calc(100vw-48px)] max-sm:min-w-0"
      role="status"
      aria-live="polite"
      aria-label={`${label}: ${text}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/12 text-white/90">
          <Sparkles size={14} aria-hidden="true" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">{label}</span>
        {recap.isFetching && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-white/45">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/70" aria-hidden="true" />
            Aggiornamento
          </span>
        )}
      </div>
      <p className="line-clamp-3 text-[clamp(15px,1.7vw,20px)] font-medium leading-[1.38] tracking-[-0.01em] text-white/90">
        {text}
      </p>
    </section>
  )
}
