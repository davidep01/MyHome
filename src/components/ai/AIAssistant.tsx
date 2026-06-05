import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Send, Wand2, MessageCircle, Cog, Check, X } from 'lucide-react'
import { GlassSheet } from '../glass/GlassSheet'
import { useEntityStore } from '../../store/entities'
import { aiApi, type AITurn, type AIContextEntity, type HAAutomation } from '../../api/ai'
import { cn } from '../../lib/utils'

const SKIP_DOMAINS = new Set(['update', 'tts', 'stt', 'conversation', 'persistent_notification', 'event', 'button'])

type Mode = 'chat' | 'automation'

export function AIAssistant() {
  const entities = useEntityStore((s) => s.entities)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('chat')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<AITurn[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<HAAutomation | null>(null)
  const [creating, setCreating] = useState(false)
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

  const genAutomation = async (prompt: string) => {
    if (loading) return
    setError(null)
    setPending(null)
    setMessages((m) => [...m, { role: 'user', text: `⚙️ ${prompt}` }])
    setLoading(true)
    scrollDown()
    try {
      const { automation } = await aiApi.automation(prompt, context)
      setPending(automation)
      setMessages((m) => [...m, {
        role: 'model',
        text: `Ho preparato un'automazione${automation.alias ? `: "${automation.alias}"` : ''}. Controlla l'anteprima qui sotto e conferma per crearla in Home Assistant.`,
      }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore AI')
    } finally {
      setLoading(false)
      scrollDown()
    }
  }

  const confirmAutomation = async () => {
    if (!pending || creating) return
    setCreating(true)
    setError(null)
    try {
      const { id } = await aiApi.createAutomation(pending)
      setMessages((m) => [...m, { role: 'model', text: `✅ Automazione creata in Home Assistant (${id}) e attivata.` }])
      setPending(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Creazione automazione fallita')
    } finally {
      setCreating(false)
      scrollDown()
    }
  }

  const cancelAutomation = () => {
    setPending(null)
    setMessages((m) => [...m, { role: 'model', text: 'Automazione annullata.' }])
    scrollDown()
  }

  const submit = () => {
    const p = input.trim()
    if (!p) return
    setInput('')
    if (mode === 'automation') genAutomation(p)
    else run('chat', p)
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
          <div className="flex rounded-full bg-black/[0.05] p-1 text-sm">
            <button
              onClick={() => setMode('chat')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 font-medium transition',
                mode === 'chat' ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-black/45',
              )}
            >
              <MessageCircle size={14} /> Chat
            </button>
            <button
              onClick={() => setMode('automation')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 font-medium transition',
                mode === 'automation' ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-black/45',
              )}
            >
              <Cog size={14} /> Automazione
            </button>
          </div>

          {mode === 'chat' && (
            <button
              onClick={() => run('suggest')}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-full bg-[#0066cc] px-4 py-2.5 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
            >
              <Wand2 size={15} /> Suggerisci automazioni
            </button>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 && !loading && (
              <p className="px-1 pt-4 text-sm text-black/45">
                {mode === 'chat'
                  ? 'Chiedi qualcosa sulla tua casa — es. "Quali luci sono accese?", "Riassumi lo stato dei sensori".'
                  : 'Descrivi l\'automazione che vuoi — es. "Spegni tutte le luci a mezzanotte", "Accendi l\'ingresso quando rilevi movimento di sera". Genero la config e tu confermi.'}
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

            {pending && (
              <div className="mr-2 overflow-hidden rounded-[16px] border border-[#0066cc]/20 bg-white">
                <div className="flex items-center gap-2 border-b border-black/8 px-3.5 py-2 text-sm font-medium text-[#1d1d1f]">
                  <Cog size={15} className="text-[#0066cc]" />
                  {pending.alias ?? 'Automazione'}
                </div>
                <pre className="max-h-52 overflow-auto bg-black/[0.02] px-3.5 py-2.5 text-[11px] leading-relaxed text-black/70">
                  {JSON.stringify(pending, null, 2)}
                </pre>
                <div className="flex gap-2 p-2.5">
                  <button
                    onClick={cancelAutomation}
                    disabled={creating}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-black/[0.06] py-2.5 text-sm font-medium text-black/70 transition active:scale-95 disabled:opacity-50"
                  >
                    <X size={15} /> Annulla
                  </button>
                  <button
                    onClick={confirmAutomation}
                    disabled={creating}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#0066cc] py-2.5 text-sm font-medium text-white transition active:scale-95 disabled:opacity-50"
                  >
                    {creating
                      ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      : <Check size={15} />}
                    Crea in HA
                  </button>
                </div>
              </div>
            )}

            {loading && (
              <div className="mr-2 flex items-center gap-2 rounded-[16px] bg-black/[0.04] px-3.5 py-2.5 text-sm text-black/50">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-[#0066cc]" />
                {mode === 'automation' ? 'Sto generando l\'automazione…' : 'Sto pensando…'}
              </div>
            )}
            {error && <p className="px-1 text-xs text-red-500">{error}</p>}
          </div>

          <div className="flex items-center gap-2 border-t border-black/8 pt-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={mode === 'automation' ? 'Descrivi l\'automazione…' : 'Scrivi un messaggio…'}
              className="h-11 flex-1 rounded-full border border-black/10 bg-white px-4 text-sm text-[#1d1d1f] outline-none placeholder:text-black/35 focus:border-[#0066cc]"
            />
            <button
              onClick={submit}
              disabled={loading || !input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0066cc] text-white transition active:scale-95 disabled:opacity-40"
              aria-label="Invia"
            >
              {mode === 'automation' ? <Cog size={16} /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </GlassSheet>
    </>
  )
}
