import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { aiApi } from '../../../api/ai'
import {
  buildScreensaverRecapInput,
  collectScreensaverRecentChanges,
  type ScreensaverRecentChange,
} from '../../../lib/screensaverRecap'
import { useEntityStore } from '../../../store/entities'

const LIVE_DEBOUNCE_MS = 600
const EVENT_AGE_TICK_MS = 30_000
const AI_DEBOUNCE_MS = 4_000
const AI_MIN_INTERVAL_MS = 20_000
const AI_MAX_WAIT_MS = 30_000

export function AmbientAIRecap() {
  const [input, setInput] = useState(() => buildScreensaverRecapInput(useEntityStore.getState().entities))
  const [aiInput, setAiInput] = useState(input)
  const [updatedAt, setUpdatedAt] = useState(() => Date.now())
  const recentChanges = useRef<ScreensaverRecentChange[]>([])
  const latestInput = useRef(input)
  const lastAiCommitAt = useRef(0)
  const aiPendingSince = useRef<number | null>(null)

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      const now = new Date()
      const next = buildScreensaverRecapInput(useEntityStore.getState().entities, now, recentChanges.current)
      setInput((current) => {
        if (current.signature === next.signature && current.localText === next.localText) return current
        latestInput.current = next
        setUpdatedAt(now.getTime())
        return next
      })
    }
    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(refresh, LIVE_DEBOUNCE_MS)
    }

    refresh()
    const unsubscribe = useEntityStore.subscribe((state, previous) => {
      if (state.entities === previous.entities) return
      const changes = collectScreensaverRecentChanges(previous.entities, state.entities)
      if (changes.length > 0) {
        recentChanges.current = [...changes.reverse(), ...recentChanges.current].slice(0, 12)
      }
      scheduleRefresh()
    })
    const interval = window.setInterval(refresh, EVENT_AGE_TICK_MS)
    return () => {
      unsubscribe()
      window.clearInterval(interval)
      if (refreshTimer) window.clearTimeout(refreshTimer)
    }
  }, [])

  useEffect(() => {
    latestInput.current = input
    if (input.signature === aiInput.signature) {
      if (lastAiCommitAt.current === 0) lastAiCommitAt.current = Date.now()
      aiPendingSince.current = null
      return
    }

    const now = Date.now()
    if (aiPendingSince.current === null) aiPendingSince.current = now
    const minIntervalRemaining = Math.max(0, AI_MIN_INTERVAL_MS - (now - lastAiCommitAt.current))
    const maxWaitRemaining = Math.max(0, AI_MAX_WAIT_MS - (now - aiPendingSince.current))
    const delay = Math.max(minIntervalRemaining, Math.min(AI_DEBOUNCE_MS, maxWaitRemaining))
    const timer = window.setTimeout(() => {
      const next = latestInput.current
      setAiInput(next)
      lastAiCommitAt.current = Date.now()
      aiPendingSince.current = null
    }, delay)
    return () => window.clearTimeout(timer)
  }, [input, aiInput.signature])

  const recap = useQuery({
    queryKey: ['screensaver-ai-recap', aiInput.signature],
    queryFn: () => aiApi.recap(aiInput.context),
    enabled: aiInput.context.length > 0,
    staleTime: AI_MIN_INTERVAL_MS,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })

  const aiIsCurrent = aiInput.signature === input.signature
  const aiText = aiIsCurrent ? recap.data?.trim() : undefined
  const text = aiText || input.localText
  const label = aiText ? 'Recap AI live' : recap.isError ? 'Casa in diretta' : 'Recap live'
  const updating = recap.isFetching || !aiIsCurrent

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
        <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-white/55">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#30d158]" aria-hidden="true" />
          Live
        </span>
        {updating && (
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-white/45">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/70" aria-hidden="true" />
            AI
          </span>
        )}
      </div>
      <p className="line-clamp-3 text-[clamp(15px,1.7vw,20px)] font-medium leading-[1.38] tracking-[-0.01em] text-white/90">
        {text}
      </p>
      <span className="sr-only">Aggiornato alle {new Date(updatedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
    </section>
  )
}
