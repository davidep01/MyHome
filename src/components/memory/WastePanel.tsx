import { useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { homeAiApi, type WasteCalendar, type WastePreview } from '../../api/homeAi'
import { formatLocalDate, formatWhen } from '../../lib/memoryLabels'
import { GlassCard } from '../glass/GlassCard'
import { ActionButton, Badge, Empty, Failure, Loading } from './MemoryUi'

const FRACTIONS = [
  { id: 'organico', label: 'Organico' }, { id: 'carta', label: 'Carta' }, { id: 'plastica', label: 'Plastica e metalli' },
  { id: 'vetro', label: 'Vetro' }, { id: 'indifferenziato', label: 'Indifferenziato' },
]
const WEEKDAYS = [['MO', 'lunedì'], ['TU', 'martedì'], ['WE', 'mercoledì'], ['TH', 'giovedì'], ['FR', 'venerdì'], ['SA', 'sabato'], ['SU', 'domenica']] as const
const STATE_LABEL: Record<string, string> = { scheduled: 'Programmato', due: 'In scadenza', visible: 'Visibile', snoozed: 'Rimandato', completed: 'Fatto', dismissed: 'Ignorato', expired: 'Scaduto', superseded: 'Sostituito' }

interface RuleDraft { fraction: string; weekday: string; interval: number; collection: string; exposureDay: number; exposureFrom: string; exposureUntil: string; reminderDay: number; reminderAt: string }

const field = 'min-h-11 w-full rounded-[11px] border border-[var(--hairline)] bg-[var(--surface-solid)] px-3 text-sm text-[var(--ink)]'
const today = () => new Date().toISOString().slice(0, 10)

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-[12px] font-semibold text-[var(--ink-secondary)]">{label}</span>{children}</label>
}

/** "Raccolta differenziata": calendario, fonte, zona, validità, prossime esposizioni e anteprima. */
export function WastePanel() {
  const queryClient = useQueryClient()
  const waste = useQuery({ queryKey: ['home-ai', 'waste'], queryFn: homeAiApi.waste, refetchInterval: 60_000 })
  const [meta, setMeta] = useState({ municipality: '', area: '', valid_from: today(), valid_until: `${new Date().getFullYear()}-12-31` })
  const [rules, setRules] = useState<RuleDraft[]>([{ fraction: 'organico', weekday: 'TU', interval: 1, collection: '', exposureDay: -1, exposureFrom: '20:00', exposureUntil: '22:00', reminderDay: -1, reminderAt: '21:00' }])
  const [exceptions, setExceptions] = useState<{ rule: number; date: string; kind: 'cancel' | 'replace'; replacement: string }[]>([])
  const [ics, setIcs] = useState<{ name: string; content: string } | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [unrecognized, setUnrecognized] = useState<string[]>([])
  const [draft, setDraft] = useState<{ calendar: WasteCalendar; preview: WastePreview } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['home-ai'] })
  const exposureOf = (rule: RuleDraft) => ({ start_day_offset: rule.exposureDay, start_time: rule.exposureFrom, end_day_offset: rule.exposureDay, end_time: rule.exposureUntil })

  const importManual = useMutation({
    mutationFn: () => {
      const calendar = {
        schema_version: 1,
        calendar_id: 'casa-raccolta',
        revision: 1,
        municipality: meta.municipality.trim(),
        area: meta.area.trim(),
        timezone: 'Europe/Rome',
        valid_from: meta.valid_from,
        valid_until: meta.valid_until,
        source: { kind: 'manual', reference: 'inserimento-regia', document_url: null, checksum: null, acquired_at: new Date().toISOString() },
        fractions: [...new Set(rules.map((r) => r.fraction))].map((id) => ({ id, label: FRACTIONS.find((f) => f.id === id)?.label ?? id })),
        rules: rules.map((rule, index) => ({
          rule_id: `r${index + 1}-${rule.fraction}`,
          fraction_id: rule.fraction,
          recurrence: { kind: 'rrule', dtstart: meta.valid_from, value: `FREQ=WEEKLY;INTERVAL=${rule.interval};BYDAY=${rule.weekday}` },
          collection_time: rule.collection || null,
          exposure: exposureOf(rule),
          reminders: [{ day_offset: rule.reminderDay, at: rule.reminderAt }],
        })),
        exceptions: exceptions.map((e) => e.kind === 'cancel'
          ? { rule_id: `r${e.rule + 1}-${rules[e.rule]?.fraction}`, original_date: e.date, kind: 'cancel' }
          : { rule_id: `r${e.rule + 1}-${rules[e.rule]?.fraction}`, original_date: e.date, kind: 'replace', replacement_date: e.replacement, collection_time: null }),
      }
      return homeAiApi.importWaste({ kind: 'manual', calendar })
    },
    onSuccess: (out) => { setDraft({ calendar: out.calendar, preview: out.preview }); setMessage('Bozza salvata: verifica l’anteprima e approvala.') },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Calendario non valido.'),
  })

  const importIcs = useMutation({
    mutationFn: () => homeAiApi.importWaste({
      kind: 'ics', content: ics?.content ?? '', calendar_id: 'casa-raccolta', municipality: meta.municipality.trim(), area: meta.area.trim(),
      timezone: 'Europe/Rome', valid_from: meta.valid_from, valid_until: meta.valid_until, label_mapping: mapping,
      exposure: exposureOf(rules[0]), reminders: [{ day_offset: rules[0].reminderDay, at: rules[0].reminderAt }],
    }),
    onSuccess: (out) => { setDraft({ calendar: out.calendar, preview: out.preview }); setUnrecognized(out.unrecognized_labels ?? []); setMessage('Bozza importata dal file: verifica l’anteprima e approvala.') },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'File non importato.'),
  })

  const approve = useMutation({
    mutationFn: () => homeAiApi.approveWaste(draft!.calendar.calendar_id, draft!.calendar.revision),
    onSuccess: async () => { setDraft(null); setMessage('Versione approvata: i promemoria useranno questo calendario.'); await refresh() },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Approvazione non riuscita.'),
  })

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1_024 * 1_024) { setMessage('File oltre 2 MB.'); return }
    void file.text().then((content) => setIcs({ name: file.name, content }))
  }
  const updateRule = (index: number, patch: Partial<RuleDraft>) => setRules((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  const active = waste.data?.active

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <GlassCard className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Calendario attivo</h2>
        {waste.isPending ? <Loading what="del calendario" />
          : waste.isError ? <Failure message={waste.error instanceof Error ? waste.error.message : 'Calendario non disponibile.'} onRetry={() => { void waste.refetch() }} />
            : !active ? <Empty>Nessun calendario approvato. Nessun comune o calendario viene indovinato: inseriscilo a destra.</Empty>
              : (
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="ok">Approvato · revisione {active.revision}</Badge>
                    {active.demo && <Badge tone="warn">Calendario dimostrativo: non vale per la casa reale</Badge>}
                    <Badge>{active.source.kind === 'manual' ? 'Inserito a mano' : active.source.kind === 'local_ics' ? 'File ICS' : 'Calendario HA'}</Badge>
                  </div>
                  <p className="text-[var(--ink)]">{active.municipality} · {active.area}</p>
                  <p className="text-[12px] text-[var(--ink-tertiary)]">Valido dal {formatLocalDate(active.valid_from)} al {formatLocalDate(active.valid_until)} · confermato {active.approval.confirmed_at ? formatWhen(active.approval.confirmed_at) : '—'}</p>
                </div>
              )}
        {waste.data?.issues.length ? (
          <ul className="space-y-1">{waste.data.issues.map((issue) => <li key={issue.code} className="rounded-[11px] bg-[var(--alert-orange)]/10 px-3 py-2 text-sm text-[var(--alert-orange)]">{issue.message}</li>)}</ul>
        ) : null}
        <h3 className="pt-2 text-sm font-semibold text-[var(--ink)]">Prossime raccolte</h3>
        {(waste.data?.upcoming.length ?? 0) === 0 ? <Empty>Nessuna occorrenza nei prossimi giorni.</Empty> : (
          <ul className="space-y-1.5">
            {waste.data!.upcoming.map((o) => (
              <li key={o.occurrence_id} className="rounded-[11px] bg-[var(--fill-subtle)] px-3 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-[var(--ink)]">{o.fraction_label} · {formatWhen(`${o.collection_date}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long' })}{o.collection_time ? ` ore ${o.collection_time}` : ''}</span>
                  <Badge>{STATE_LABEL[o.state] ?? o.state}</Badge>
                  {o.time_resolution !== 'exact' && <Badge tone="warn">Cambio d’ora: orario adattato</Badge>}
                </div>
                <p className="text-[12px] text-[var(--ink-secondary)]">Esposizione {formatWhen(o.exposure_from)} – {formatWhen(o.exposure_until, { hour: '2-digit', minute: '2-digit' })} · promemoria {formatWhen(o.reminder_at, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Nuova versione del calendario</h2>
        <p className="text-[12px] text-[var(--ink-tertiary)]">Raccolta, esposizione e promemoria sono orari distinti. Una festività non sposta la raccolta: aggiungi un’eccezione solo se il gestore l’ha pubblicata.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Labeled label="Comune"><input className={field} value={meta.municipality} onChange={(e) => setMeta({ ...meta, municipality: e.target.value })} /></Labeled>
          <Labeled label="Zona / giro"><input className={field} value={meta.area} onChange={(e) => setMeta({ ...meta, area: e.target.value })} /></Labeled>
          <Labeled label="Valido dal"><input type="date" className={field} value={meta.valid_from} onChange={(e) => setMeta({ ...meta, valid_from: e.target.value })} /></Labeled>
          <Labeled label="Valido fino al"><input type="date" className={field} value={meta.valid_until} onChange={(e) => setMeta({ ...meta, valid_until: e.target.value })} /></Labeled>
        </div>
        {rules.map((rule, index) => (
          <fieldset key={index} className="space-y-2 rounded-[11px] bg-[var(--fill-subtle)] p-3">
            <legend className="px-1 text-[12px] font-semibold text-[var(--ink-secondary)]">Regola {index + 1}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Labeled label="Frazione"><select className={field} value={rule.fraction} onChange={(e) => updateRule(index, { fraction: e.target.value })}>{FRACTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></Labeled>
              <Labeled label="Giorno di raccolta"><select className={field} value={rule.weekday} onChange={(e) => updateRule(index, { weekday: e.target.value })}>{WEEKDAYS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></Labeled>
              <Labeled label="Ogni"><select className={field} value={rule.interval} onChange={(e) => updateRule(index, { interval: Number(e.target.value) })}><option value={1}>settimana</option><option value={2}>2 settimane</option></select></Labeled>
              <Labeled label="Ora raccolta (se nota)"><input type="time" className={field} value={rule.collection} onChange={(e) => updateRule(index, { collection: e.target.value })} /></Labeled>
              <Labeled label="Esposizione"><select className={field} value={rule.exposureDay} onChange={(e) => updateRule(index, { exposureDay: Number(e.target.value) })}><option value={-1}>giorno prima</option><option value={0}>giorno stesso</option></select></Labeled>
              <Labeled label="dalle"><input type="time" className={field} value={rule.exposureFrom} onChange={(e) => updateRule(index, { exposureFrom: e.target.value })} /></Labeled>
              <Labeled label="alle"><input type="time" className={field} value={rule.exposureUntil} onChange={(e) => updateRule(index, { exposureUntil: e.target.value })} /></Labeled>
              <Labeled label="Promemoria"><select className={field} value={rule.reminderDay} onChange={(e) => updateRule(index, { reminderDay: Number(e.target.value) })}><option value={-1}>giorno prima</option><option value={0}>giorno stesso</option></select></Labeled>
              <Labeled label="alle"><input type="time" className={field} value={rule.reminderAt} onChange={(e) => updateRule(index, { reminderAt: e.target.value })} /></Labeled>
            </div>
            {rules.length > 1 && <ActionButton tone="danger" onClick={() => setRules((list) => list.filter((_, i) => i !== index))}>Rimuovi regola</ActionButton>}
          </fieldset>
        ))}
        <ActionButton onClick={() => setRules((list) => [...list, { ...list[list.length - 1] }])}>Aggiungi regola</ActionButton>

        <fieldset className="space-y-2 rounded-[11px] bg-[var(--fill-subtle)] p-3">
          <legend className="px-1 text-[12px] font-semibold text-[var(--ink-secondary)]">Eccezioni pubblicate</legend>
          {exceptions.map((exception, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <select aria-label="Regola" className={field} value={exception.rule} onChange={(e) => setExceptions((list) => list.map((x, i) => (i === index ? { ...x, rule: Number(e.target.value) } : x)))}>{rules.map((_r, i) => <option key={i} value={i}>Regola {i + 1}</option>)}</select>
              <input aria-label="Data originale" type="date" className={field} value={exception.date} onChange={(e) => setExceptions((list) => list.map((x, i) => (i === index ? { ...x, date: e.target.value } : x)))} />
              <select aria-label="Tipo" className={field} value={exception.kind} onChange={(e) => setExceptions((list) => list.map((x, i) => (i === index ? { ...x, kind: e.target.value as 'cancel' | 'replace' } : x)))}><option value="cancel">Annullata</option><option value="replace">Recupero in altra data</option></select>
              {exception.kind === 'replace' && <input aria-label="Data di recupero" type="date" className={field} value={exception.replacement} onChange={(e) => setExceptions((list) => list.map((x, i) => (i === index ? { ...x, replacement: e.target.value } : x)))} />}
            </div>
          ))}
          <ActionButton onClick={() => setExceptions((list) => [...list, { rule: 0, date: today(), kind: 'cancel', replacement: today() }])}>Aggiungi eccezione</ActionButton>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <ActionButton tone="primary" disabled={importManual.isPending || !meta.municipality || !meta.area} onClick={() => { setMessage(null); importManual.mutate() }}>Crea bozza e anteprima</ActionButton>
          <label className="flex min-h-11 cursor-pointer items-center rounded-full bg-[var(--fill-subtle)] px-4 text-sm font-semibold text-[var(--ink)]">
            Importa file ICS
            <input type="file" accept=".ics,text/calendar" className="sr-only" onChange={onFile} />
          </label>
          {ics && <ActionButton disabled={importIcs.isPending || !meta.municipality || !meta.area} onClick={() => { setMessage(null); importIcs.mutate() }}>Anteprima di {ics.name}</ActionButton>}
        </div>
        {unrecognized.length > 0 && (
          <div className="space-y-2 rounded-[11px] bg-[var(--alert-orange)]/10 p-3">
            <p className="text-sm text-[var(--alert-orange)]">Etichette non riconosciute: indica la frazione e ripeti l’anteprima.</p>
            {unrecognized.map((labelText) => (
              <Labeled key={labelText} label={labelText}>
                <select className={field} value={mapping[labelText] ?? ''} onChange={(e) => setMapping({ ...mapping, [labelText]: e.target.value })}>
                  <option value="">— ignora —</option>
                  {FRACTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </Labeled>
            ))}
          </div>
        )}
        {draft && (
          <div className="space-y-2 rounded-[11px] border border-[var(--hairline)] p-3">
            <p className="text-sm font-semibold text-[var(--ink)]">Anteprima revisione {draft.calendar.revision}</p>
            {draft.preview.issues.map((issue) => <p key={issue.code} className="text-sm text-[var(--alert-orange)]">{issue.message}</p>)}
            <p className="text-[12px] text-[var(--ink-secondary)]">Nuove: {draft.preview.diff.added.slice(0, 6).join(', ') || 'nessuna'} · Tolte: {draft.preview.diff.removed.slice(0, 6).join(', ') || 'nessuna'} · Cambiate: {draft.preview.diff.changed.slice(0, 6).join(', ') || 'nessuna'}</p>
            {draft.preview.dst_adjusted.length > 0 && <p className="text-[12px] text-[var(--alert-orange)]">Orari adattati per il cambio d’ora: {draft.preview.dst_adjusted.map((d) => d.date).join(', ')} (ora inesistente → primo istante valido; ora ripetuta → la prima).</p>}
            <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[12px] text-[var(--ink-secondary)]">
              {draft.preview.occurrences.slice(0, 12).map((o) => <li key={o.occurrence_id}>{o.fraction_label} {o.collection_date} · promemoria {formatWhen(o.reminder_at, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</li>)}
            </ul>
            <ActionButton tone="primary" disabled={approve.isPending} onClick={() => approve.mutate()}>Approva questa versione</ActionButton>
          </div>
        )}
        {message && <p role="status" aria-live="polite" className="text-sm font-semibold text-[var(--ink-secondary)]">{message}</p>}
      </GlassCard>
    </div>
  )
}
