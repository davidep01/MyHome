import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Send, Wand2 } from 'lucide-react'
import { GlassSheet } from '../glass/GlassSheet'
import { useEntityStore } from '../../store/entities'
import { aiApi, type AITurn, type AIContextEntity } from '../../api/ai'
import { cn } from '../../lib/utils'

const SKIP_DOMAINS = new Set(['update', 'tts', 'stt', 'conversation', 'persistent_notification', 'event', 'button'])

export function AIAssistant() {
  const entities = useEntityStore((s) => s.entities)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<AITurn[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const context = useMemo<AIContextEntity[]>(
    () =>
      Object.values(entities)
        .filter((e) => !SKIP_DOMAINS.has(e.entity_id.split('.')[0]))
        .slice(0, 120)
        .map((e) => ({
          entity_id: e.entity_id,
          state: e.state,
          name: e.attributes?.friendly_name as string | undefined,
        })),
    [entities],
  )

  const scrollDown = () => requestAnimationFrame(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  })

  const run = async (kind: 'chat' | 'suggest', prompt?: string) => {
    if (loading) return
    setError(null)
    const history = messages
    if (kind === 'chat' && prompt) setMessages((m) => [...m, { role: 'user', text: prompt }])
    if (kind === 'suggest') setMessages((m) => [...m, { role: 'user', text: '💡 Suggerisci automazioni utili ora' }])
    setLoading(true)
    scrollDown()
    try {
      const text = kind === 'chat'
        ? await aiApi.chat(prompt!, context, history)
        : await aiApi.suggest(context)
      setMessages((m) => [...m, { role: 'model', text }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore AI')
    } finally {
      setLoading(false)
      scrollDown()
    }
  }

  const submit = () => {
    const p = input.trim()
    if (!p) return
    setInput('')
    run('chat', p)
  }

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.9 }}
        aria-label="Assistente AI"
        className="group relative flex h-11 w-11 items-center justify-center rounded-[16px] text-white transition-transform"
        style={{ background: 'linear-gradient(135deg, #0066cc, #7c3aed)' }}
      >
        <Sparkles size={20} />
        <span className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-lg bg-black/80 px-2 py-1 text-xs text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
          Assistente AI
        </span>
      </motion.button>

      <GlassSheet open={open} onClose={() => setOpen(false)} title="Assistente AI" side="right" className="w-[min(420px,92vw)]">
        <div className="flex h-full flex-col gap-3">
          <button
            onClick={() => run('suggest')}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-full bg-[#0066cc] px-4 py-2.5 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
          >
            <Wand2 size={15} /> Suggerisci automazioni
          </button>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 && !loading && (
              <p className="px-1 pt-4 text-sm text-black/45">
                Chiedi qualcosa sulla tua casa — es. "Quali luci sono accese?", "Crea un'automazione per
                spegnere tutto a mezzanotte", "Riassumi lo stato dei sensori".
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-[16px] px-3.5 py-2.5 text-sm whitespace-pre-wrap',
                  m.role === 'user'
                    ? 'ml-6 bg-[#0066cc] text-white'
                    : 'mr-2 bg-black/[0.04] text-[#1d1d1f]',
                )}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="mr-2 flex items-center gap-2 rounded-[16px] bg-black/[0.04] px-3.5 py-2.5 text-sm text-black/50">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-[#0066cc]" />
                Sto pensando…
              </div>
            )}
            {error && <p className="px-1 text-xs text-red-500">{error}</p>}
          </div>

          <div className="flex items-center gap-2 border-t border-black/8 pt-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Scrivi un messaggio…"
              className="h-11 flex-1 rounded-full border border-black/10 bg-white px-4 text-sm text-[#1d1d1f] outline-none placeholder:text-black/35 focus:border-[#0066cc]"
            />
            <button
              onClick={submit}
              disabled={loading || !input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0066cc] text-white transition active:scale-95 disabled:opacity-40"
              aria-label="Invia"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </GlassSheet>
    </>
  )
}
