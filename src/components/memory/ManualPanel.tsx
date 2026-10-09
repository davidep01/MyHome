import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { homeAiApi, type KnowledgeFact, type KnowledgeNoteInput } from '../../api/homeAi'
import { formatWhen } from '../../lib/memoryLabels'
import { GlassCard } from '../glass/GlassCard'
import { ActionButton, Badge, Empty, Failure, Loading } from './MemoryUi'
import { cn } from '../../lib/utils'

const KIND_LABEL: Record<KnowledgeFact['kind'], string> = {
  home: 'Casa', room: 'Stanze', device: 'Dispositivi', habit: 'Abitudini', preference: 'Preferenze',
  waste: 'Raccolta', rule: 'Regole', limit: 'Limiti', note: 'Note',
}
const KIND_ORDER: KnowledgeFact['kind'][] = ['home', 'limit', 'rule', 'preference', 'habit', 'waste', 'note', 'room', 'device']

const CONFIDENCE: Record<KnowledgeFact['confidence'], { label: string; tone: 'neutral' | 'blue' | 'ok' | 'warn' }> = {
  certain: { label: 'Certo', tone: 'neutral' }, observed: { label: 'Osservato', tone: 'blue' },
  declared: { label: 'Dichiarato da te', tone: 'ok' }, uncertain: { label: 'Da verificare', tone: 'warn' },
}

const SOURCE_LABEL: Record<KnowledgeFact['source']['module'], string> = {
  config: 'configurazione', catalog: 'entità scelte', patterns: 'abitudini osservate', preferences: 'tue preferenze',
  waste: 'calendario raccolta', policy: 'regole', coverage: 'copertura', user: 'tua nota',
}

const PAGE = 40
const field = 'min-h-11 w-full rounded-[11px] border border-[var(--hairline)] bg-[var(--surface-solid)] px-3 text-sm text-[var(--ink)]'

/** "cane, Cucina grande" → ["cane", "cucina-grande"]: stesso alfabeto dei tag del core. */
function toTags(text: string): string[] {
  return [...new Set(text.split(',').map((raw) => raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^a-z0-9_.:-]/g, '').replace(/^[^a-z0-9]+/, '').slice(0, 40)).filter(Boolean))].slice(0, 16)
}

function FactRow({ fact }: { fact: KnowledgeFact & { score?: number; pinned?: boolean } }) {
  const confidence = CONFIDENCE[fact.confidence]
  return (
    <li className="space-y-1 rounded-[11px] bg-[var(--fill-subtle)] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-[var(--ink)]">{fact.title}</span>
        <Badge tone={confidence.tone}>{confidence.label}</Badge>
        {fact.pinned && <Badge tone="blue">Sempre incluso</Badge>}
        {fact.demo && <Badge tone="warn">Demo</Badge>}
      </div>
      <p className="text-sm text-[var(--ink-secondary)]">{fact.statement}</p>
      <p className="text-[11px] text-[var(--ink-tertiary)]">
        Fonte: {SOURCE_LABEL[fact.source.module]}
        {fact.valid_until && <> · valido fino a {formatWhen(fact.valid_until, { day: 'numeric', month: 'short', year: 'numeric' })}</>}
        {fact.score !== undefined && !fact.pinned && <> · pertinenza {fact.score}</>}
      </p>
    </li>
  )
}

function NoteForm({ initial, onDone }: { initial: KnowledgeFact | null; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [statement, setStatement] = useState(initial?.statement ?? '')
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '')
  const [until, setUntil] = useState(initial?.valid_until ? initial.valid_until.slice(0, 10) : '')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => {
      const note: KnowledgeNoteInput = {
        title: title.trim(), statement: statement.trim(), tags: toTags(tags), entity_ids: initial?.entity_ids ?? [],
        subject_id: initial?.scope.kind === 'person' ? initial.scope.subject_id : null,
        valid_from: initial?.valid_from ?? null, valid_until: until ? new Date(`${until}T23:59:00`).toISOString() : null,
      }
      return initial ? homeAiApi.updateNote(initial.fact_id, note, initial.revision) : homeAiApi.createNote(note)
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['home-ai', 'knowledge'] }); onDone() },
    onError: (e) => setError(e instanceof Error ? e.message : 'Nota non salvata.'),
  })
  return (
    <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); setError(null); save.mutate() }}>
      <label className="block space-y-1">
        <span className="text-[12px] font-semibold text-[var(--ink-secondary)]">Titolo</span>
        <input className={field} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Il cane" required />
      </label>
      <label className="block space-y-1">
        <span className="flex justify-between text-[12px] font-semibold text-[var(--ink-secondary)]"><span>Cosa deve sapere il sistema</span><span className="tabular-nums text-[var(--ink-tertiary)]">{statement.length}/600</span></span>
        <textarea className={cn(field, 'min-h-24 py-2')} value={statement} maxLength={600} onChange={(e) => setStatement(e.target.value)}
          placeholder="Es. Il cane dorme in cucina: niente robot aspirapolvere la notte." required />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-[var(--ink-secondary)]">Parole chiave (separate da virgola)</span>
          <input className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="cane, cucina, notte" />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-[var(--ink-secondary)]">Vale fino al (facoltativo)</span>
          <input type="date" className={field} value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
      </div>
      <p className="text-[12px] text-[var(--ink-tertiary)]">Niente password, codici o token: una nota che ne contiene viene rifiutata.</p>
      {error && <p role="alert" className="text-sm font-semibold text-[var(--danger-red)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={save.isPending || !title.trim() || !statement.trim()}
          className="min-h-11 rounded-full bg-[var(--action-blue)] px-4 text-sm font-semibold text-[var(--on-accent)] transition active:scale-95 disabled:opacity-40">
          {initial ? 'Salva modifiche' : 'Aggiungi al manuale'}
        </button>
        <ActionButton onClick={onDone}>Annulla</ActionButton>
      </div>
    </form>
  )
}

/** "Manuale della casa": ciò che un futuro modello locale saprà della casa, con la fonte di ogni fatto. */
export function ManualPanel() {
  const queryClient = useQueryClient()
  const knowledge = useQuery({ queryKey: ['home-ai', 'knowledge'], queryFn: homeAiApi.knowledge, refetchInterval: 60_000 })
  const [kind, setKind] = useState<KnowledgeFact['kind'] | 'all'>('all')
  const [shown, setShown] = useState(PAGE)
  const [editing, setEditing] = useState<KnowledgeFact | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const [budget, setBudget] = useState(2_000)
  const [message, setMessage] = useState<string | null>(null)
  const search = useMutation({ mutationFn: () => homeAiApi.knowledgeSearch(query, budget) })
  const remove = useMutation({
    mutationFn: homeAiApi.deleteNote,
    onSuccess: async () => { setMessage('Nota eliminata.'); await queryClient.invalidateQueries({ queryKey: ['home-ai', 'knowledge'] }) },
    onError: (e) => setMessage(e instanceof Error ? e.message : 'Nota non eliminata.'),
  })

  const facts = useMemo(() => knowledge.data?.facts ?? [], [knowledge.data])
  const counts = useMemo(() => facts.reduce<Record<string, number>>((acc, fact) => ({ ...acc, [fact.kind]: (acc[fact.kind] ?? 0) + 1 }), {}), [facts])
  const visible = useMemo(() => facts
    .filter((fact) => kind === 'all' || fact.kind === kind)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title, 'it')), [facts, kind])
  const notes = facts.filter((fact) => fact.origin === 'user')

  const download = async () => {
    try {
      const data = await homeAiApi.knowledgeExport()
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `manuale-della-casa-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Esportazione non riuscita.')
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <GlassCard className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold text-[var(--ink)]">Manuale della casa</h2>
          {knowledge.data?.demo && <Badge tone="warn">Demo · dati sintetici</Badge>}
          <ActionButton onClick={() => { void download() }}>Esporta per il modello (JSON)</ActionButton>
        </div>
        <p className="text-[12px] text-[var(--ink-tertiary)]">
          Ciò che un futuro modello locale saprà della casa. I fatti si ricalcolano dai dati del sistema (niente si inventa, ciò che dimentichi sparisce anche da qui) e ognuno dice da dove viene. Sono dati, non istruzioni: i limiti restano nel motore delle regole.
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtra per tipo">
          {(['all', ...KIND_ORDER] as const).map((id) => (
            <button key={id} type="button" aria-pressed={kind === id} onClick={() => { setKind(id); setShown(PAGE) }}
              className={cn('min-h-11 rounded-full px-3 text-xs font-semibold', kind === id ? 'bg-[var(--action-blue)] text-[var(--on-accent)]' : 'bg-[var(--fill-subtle)] text-[var(--ink-secondary)]')}>
              {id === 'all' ? `Tutto ${facts.length}` : `${KIND_LABEL[id]} ${counts[id] ?? 0}`}
            </button>
          ))}
        </div>
        {knowledge.isPending ? <Loading what="del manuale" />
          : knowledge.isError ? <Failure message={knowledge.error instanceof Error ? knowledge.error.message : 'Manuale non disponibile.'} onRetry={() => { void knowledge.refetch() }} />
            : visible.length === 0 ? <Empty>Niente in questa categoria.</Empty>
              : (
                <>
                  <ul className="space-y-1.5">{visible.slice(0, shown).map((fact) => <FactRow key={fact.fact_id} fact={fact} />)}</ul>
                  {visible.length > shown && <ActionButton onClick={() => setShown((n) => n + PAGE)}>Mostra altri {Math.min(PAGE, visible.length - shown)}</ActionButton>}
                </>
              )}
      </GlassCard>

      <div className="space-y-5">
        <GlassCard className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Cosa riceverebbe il modello</h2>
          <p className="text-[12px] text-[var(--ink-tertiary)]">Un modello locale ha poco spazio: riceve solo i fatti pertinenti alla domanda, entro un limite di caratteri, e i limiti del sistema sempre per primi. Qui puoi provarlo; nessun modello viene interrogato.</p>
          <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); search.mutate() }}>
            <input className={cn(field, 'min-w-0 flex-1')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Es. quando passa l’organico?" aria-label="Domanda di prova" />
            <select className={cn(field, 'w-auto')} value={budget} onChange={(e) => setBudget(Number(e.target.value))} aria-label="Spazio disponibile">
              <option value={1000}>1.000 caratteri</option><option value={2000}>2.000 caratteri</option><option value={4000}>4.000 caratteri</option>
            </select>
            <button type="submit" disabled={search.isPending}
              className="min-h-11 rounded-full bg-[var(--action-blue)] px-4 text-sm font-semibold text-[var(--on-accent)] transition active:scale-95 disabled:opacity-40">Prova</button>
          </form>
          {search.isError && <Failure message={search.error instanceof Error ? search.error.message : 'Ricerca non riuscita.'} />}
          {search.data && (
            <div className="space-y-2">
              <p className="text-[12px] text-[var(--ink-secondary)]">
                {search.data.facts.length} fatti · {search.data.chars.toLocaleString('it-IT')} di {search.data.budget.toLocaleString('it-IT')} caratteri
                {search.data.truncated && ' · altri fatti pertinenti esclusi per spazio'}
              </p>
              <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-1">{search.data.facts.map((fact) => <FactRow key={fact.fact_id} fact={fact} />)}</ul>
            </div>
          )}
        </GlassCard>

        <GlassCard className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-[var(--ink)]">Le tue note</h2>
            {editing === null && <ActionButton tone="primary" onClick={() => { setMessage(null); setEditing('new') }}>Nuova nota</ActionButton>}
          </div>
          <p className="text-[12px] text-[var(--ink-tertiary)]">Ciò che i sensori non possono sapere: abitudini della famiglia, eccezioni, periodi di assenza. Valgono più delle abitudini osservate.</p>
          {editing !== null && <NoteForm key={editing === 'new' ? 'new' : editing.fact_id} initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
          {message && <p role="status" aria-live="polite" className="text-sm font-semibold text-[var(--ink-secondary)]">{message}</p>}
          {notes.length === 0 ? <Empty>Nessuna nota ancora.</Empty> : (
            <ul className="space-y-1.5">
              {notes.map((fact) => (
                <li key={fact.fact_id} className="space-y-1 rounded-[11px] bg-[var(--fill-subtle)] px-3 py-2.5">
                  <p className="text-sm font-semibold text-[var(--ink)]">{fact.title}</p>
                  <p className="text-sm text-[var(--ink-secondary)]">{fact.statement}</p>
                  {fact.tags.length > 0 && <div className="flex flex-wrap gap-1">{fact.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <ActionButton onClick={() => { setMessage(null); setEditing(fact) }}>Modifica</ActionButton>
                    <ActionButton tone="danger" disabled={remove.isPending} onClick={() => { if (window.confirm('Eliminare questa nota dal manuale?')) remove.mutate(fact.fact_id) }}>Elimina</ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
    </div>
  )
}
