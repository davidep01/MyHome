import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { homeAiApi, type CoreConfig } from '../../api/homeAi'
import { GlassCard } from '../glass/GlassCard'
import { ActionButton, Badge, Failure, Loading } from './MemoryUi'
import { cn } from '../../lib/utils'

const field = 'min-h-11 w-full rounded-[11px] border border-[var(--hairline)] bg-[var(--surface-solid)] px-3 text-sm text-[var(--ink)]'

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={cn('flex min-h-11 cursor-pointer items-start gap-3 rounded-[11px] bg-[var(--fill-subtle)] px-3 py-2.5', disabled && 'opacity-50')}>
      <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--action-blue)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0"><span className="block text-sm font-semibold text-[var(--ink)]">{label}</span>{hint && <span className="block text-[12px] text-[var(--ink-tertiary)]">{hint}</span>}</span>
    </label>
  )
}

function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-semibold text-[var(--ink-secondary)]">{label}</span>
      <input type="number" className={field} value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

/** "Impostazioni e privacy": modalità, fonti, entità opt-in, consensi, agenti, soglie, retention, export e oblio. */
export function SettingsPanel() {
  const queryClient = useQueryClient()
  const remote = useQuery({ queryKey: ['home-ai', 'config'], queryFn: homeAiApi.config })
  const privacy = useQuery({ queryKey: ['home-ai', 'privacy'], queryFn: homeAiApi.privacy })
  const candidates = useQuery({ queryKey: ['home-ai', 'candidates'], queryFn: homeAiApi.candidates, staleTime: 60_000 })
  const status = useQuery({ queryKey: ['home-ai', 'status'], queryFn: homeAiApi.status })
  // Bozza locale solo dopo la prima modifica: finché è null si mostra la configurazione salvata.
  const [edited, setEdited] = useState<CoreConfig | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['home-ai'] })
  const save = useMutation({
    mutationFn: () => homeAiApi.saveConfig(edited ?? remote.data!.config, remote.data!.revision),
    onSuccess: async () => { setEdited(null); setMessage('Impostazioni salvate.'); await invalidate() },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Impostazioni non valide.'),
  })
  const consent = useMutation({
    mutationFn: (patch: Parameters<typeof homeAiApi.setPrivacy>[1]) => homeAiApi.setPrivacy(privacy.data!.config_revision, patch),
    onSuccess: async () => { setEdited(null); setMessage('Consenso aggiornato e registrato.'); await invalidate() },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Consenso non aggiornato.'),
  })
  const forget = useMutation({
    mutationFn: homeAiApi.deleteData,
    onSuccess: async (job) => { setMessage(`Cancellati: ${job.removed.events} eventi, ${job.removed.episodes} episodi, ${job.removed.patterns} abitudini, ${job.removed.snapshots} contesti, ${job.removed.proposals} proposte.`); await invalidate() },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Cancellazione non riuscita.'),
  })
  const demo = useMutation({
    mutationFn: async (action: 'seed' | 'clear') => (action === 'seed' ? homeAiApi.seedDemo() : homeAiApi.clearDemo()),
    onSuccess: async () => { setMessage('Dati dimostrativi aggiornati.'); await invalidate() },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Operazione non riuscita.'),
  })
  const guests = useMutation({ mutationFn: (value: boolean) => homeAiApi.setFlags({ guests: value }), onSuccess: invalidate })

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (candidates.data?.candidates ?? [])
      .filter((c) => !q || c.entity_id.includes(q) || c.label.toLowerCase().includes(q))
      .slice(0, 80)
  }, [candidates.data, search])

  const draft = edited ?? remote.data?.config
  if (!draft) return remote.isError ? <Failure message={remote.error instanceof Error ? remote.error.message : 'Impostazioni non disponibili.'} /> : <Loading what="delle impostazioni" />

  const ha = draft.sources.home_assistant
  const set = (mutate: (next: CoreConfig) => void) => { const next = structuredClone(draft); mutate(next); setEdited(next) }
  const selected = new Set(ha.selected_entities)
  const toggleEntity = (id: string, on: boolean) => set((next) => {
    const s = new Set(next.sources.home_assistant.selected_entities)
    if (on) s.add(id); else s.delete(id)
    next.sources.home_assistant.selected_entities = [...s].slice(0, 1_000)
  })
  const setRole = (id: string, role: 'none' | 'presence' | 'door' | 'window') => set((next) => {
    const h = next.sources.home_assistant
    h.presence_entities = h.presence_entities.filter((x) => x !== id)
    h.door_entities = h.door_entities.filter((x) => x !== id)
    h.window_entities = h.window_entities.filter((x) => x !== id)
    if (role === 'presence') h.presence_entities.push(id)
    if (role === 'door') h.door_entities.push(id)
    if (role === 'window') h.window_entities.push(id)
  })
  const roleOf = (id: string) => ha.presence_entities.includes(id) ? 'presence' : ha.door_entities.includes(id) ? 'door' : ha.window_entities.includes(id) ? 'window' : 'none'

  const download = async () => {
    const data = await homeAiApi.exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `home-ai-core-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <GlassCard className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Modalità e fonti</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Modalità operativa">
          {([['observe', 'Sola osservazione'], ['shadow', 'In ombra (diagnostica)'], ['suggest', 'Suggerimenti']] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={draft.runtime.mode === id} onClick={() => set((n) => { n.runtime.mode = id })}
              className={cn('min-h-11 rounded-full px-4 text-sm font-semibold', draft.runtime.mode === id ? 'bg-[var(--action-blue)] text-[var(--on-accent)]' : 'bg-[var(--fill-subtle)] text-[var(--ink-secondary)]')}>{label}</button>
          ))}
        </div>
        <p className="text-[12px] text-[var(--ink-tertiary)]">Nessuna modalità esegue comandi: “Suggerimenti” mostra proposte nella regia, mai azioni sui dispositivi.</p>
        <Toggle checked={draft.runtime.demo} onChange={(v) => set((n) => { n.runtime.demo = v; n.sources.fixtures.enabled = v; if (v) n.privacy.real_learning_enabled = false })} label="Usa la demo con dati sintetici" hint="Per provare il sistema senza Home Assistant. I dati demo restano separati e marcati." />
        <Toggle checked={ha.enabled} disabled={draft.runtime.demo} onChange={(v) => set((n) => { n.sources.home_assistant.enabled = v })} label="Leggi da Home Assistant (sola lettura)" hint="Riusa il collegamento già attivo della dashboard; solo le entità selezionate qui sotto vengono osservate." />
        <Toggle checked={guests.isPending ? !status.data?.flags.guests : Boolean(status.data?.flags.guests)} onChange={(v) => guests.mutate(v)} label="Modalità ospiti" hint="Sospende i suggerimenti basati sulle abitudini e non contamina il profilo ordinario." />

        <h3 className="pt-1 text-sm font-semibold text-[var(--ink)]">Meteo</h3>
        <select className={field} value={draft.sources.weather.adapter} onChange={(e) => set((n) => { n.sources.weather.adapter = e.target.value as CoreConfig['sources']['weather']['adapter']; n.sources.weather.external_network_enabled = e.target.value === 'myhome_openweather' })}>
          <option value="none">Nessuna previsione</option>
          <option value="fixture">Solo previsioni sintetiche della demo</option>
          <option value="myhome_openweather">OpenWeather già configurato (usa Internet)</option>
        </select>

        <h3 className="pt-1 text-sm font-semibold text-[var(--ink)]">Agenti</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Toggle checked={draft.agents.arrival} onChange={(v) => set((n) => { n.agents.arrival = v })} label="Rientro" />
          <Toggle checked={draft.agents.waste} onChange={(v) => set((n) => { n.agents.waste = v })} label="Raccolta differenziata" />
          <Toggle checked={draft.agents.weather} onChange={(v) => set((n) => { n.agents.weather = v })} label="Meteo" />
          <Toggle checked={draft.agents.comfort} onChange={(v) => set((n) => { n.agents.comfort = v })} label="Comfort" hint="Resta inattivo senza sensori adatti." />
          <Toggle checked={draft.agents.energy} onChange={(v) => set((n) => { n.agents.energy = v })} label="Energia" hint="Nessuna stima inventata: inattivo senza misure e obiettivi." />
        </div>

        <h3 className="pt-1 text-sm font-semibold text-[var(--ink)]">Attenzione</h3>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Suggerimenti al giorno" value={draft.attention.proactive_daily_budget} min={0} max={50} onChange={(v) => set((n) => { n.attention.proactive_daily_budget = v })} />
          <NumberField label="Pausa sullo stesso tema (ore)" value={draft.attention.topic_cooldown_hours} min={0} max={168} onChange={(v) => set((n) => { n.attention.topic_cooldown_hours = v })} />
          <label className="block space-y-1"><span className="text-[12px] font-semibold text-[var(--ink-secondary)]">Quiete dalle</span><input type="time" className={field} value={draft.attention.quiet_hours.from} onChange={(e) => set((n) => { n.attention.quiet_hours.from = e.target.value })} /></label>
          <label className="block space-y-1"><span className="text-[12px] font-semibold text-[var(--ink-secondary)]">alle</span><input type="time" className={field} value={draft.attention.quiet_hours.until} onChange={(e) => set((n) => { n.attention.quiet_hours.until = e.target.value })} /></label>
        </div>

        <h3 className="pt-1 text-sm font-semibold text-[var(--ink)]">Soglie di apprendimento</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <NumberField label="Rientri minimi" value={draft.learning.min_opportunities} min={3} max={1000} onChange={(v) => set((n) => { n.learning.min_opportunities = v })} />
          <NumberField label="Ripetizioni minime" value={draft.learning.min_successes} min={2} max={1000} onChange={(v) => set((n) => { n.learning.min_successes = v })} />
          <NumberField label="Giorni diversi" value={draft.learning.min_distinct_days} min={1} max={365} onChange={(v) => set((n) => { n.learning.min_distinct_days = v })} />
          <NumberField label="Giorni di osservazione" value={draft.learning.min_observation_days} min={1} max={365} onChange={(v) => set((n) => { n.learning.min_observation_days = v })} />
          <NumberField label="Frequenza minima" value={draft.learning.min_frequency} min={0} max={1} step={0.05} onChange={(v) => set((n) => { n.learning.min_frequency = v })} />
          <NumberField label="Emivita (giorni)" value={draft.learning.decay_half_life_days} min={1} max={365} onChange={(v) => set((n) => { n.learning.decay_half_life_days = v })} />
        </div>

        <h3 className="pt-1 text-sm font-semibold text-[var(--ink)]">Conservazione (giorni)</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <NumberField label="Eventi" value={draft.privacy.retention_days.events} min={1} max={365} onChange={(v) => set((n) => { n.privacy.retention_days.events = v })} />
          <NumberField label="Episodi" value={draft.privacy.retention_days.episodes} min={1} max={730} onChange={(v) => set((n) => { n.privacy.retention_days.episodes = v })} />
          <NumberField label="Statistiche" value={draft.privacy.retention_days.statistics} min={1} max={730} onChange={(v) => set((n) => { n.privacy.retention_days.statistics = v })} />
          <NumberField label="Audit" value={draft.privacy.retention_days.audit} min={1} max={365} onChange={(v) => set((n) => { n.privacy.retention_days.audit = v })} />
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton tone="primary" disabled={save.isPending} onClick={() => { setMessage(null); save.mutate() }}>Salva impostazioni</ActionButton>
          <ActionButton onClick={() => { setEdited(null); void remote.refetch() }}>Annulla modifiche</ActionButton>
        </div>
        {message && <p role="status" aria-live="polite" className="text-sm font-semibold text-[var(--ink-secondary)]">{message}</p>}
      </GlassCard>

      <div className="space-y-5">
        <GlassCard className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Consensi</h2>
          <p className="text-[12px] text-[var(--ink-tertiary)]">Tre consensi distinti: uno non implica gli altri. Ogni modifica è registrata. Revocare l’apprendimento ferma le inferenze e rimuove le abitudini derivate dai dati reali.</p>
          {privacy.isPending ? <Loading what="dei consensi" /> : privacy.data && (
            <div className="space-y-2">
              <Toggle checked={privacy.data.privacy.real_observation_enabled} disabled={consent.isPending} onChange={(v) => consent.mutate({ real_observation_enabled: v })} label="Osservazione" hint="Registra eventi delle sole entità selezionate e i gesti fatti dalla dashboard." />
              <Toggle checked={privacy.data.privacy.real_learning_enabled} disabled={consent.isPending || draft.runtime.demo} onChange={(v) => consent.mutate({ real_learning_enabled: v })} label="Apprendimento" hint="Cerca abitudini statistiche locali. Mai cloud, mai modelli AI." />
              <Toggle checked={privacy.data.privacy.personal_profiles_enabled} disabled={consent.isPending} onChange={(v) => consent.mutate({ personal_profiles_enabled: v })} label="Profili personali" hint="Separa le abitudini per persona (pseudonimi). Il tablet condiviso non identifica chi lo usa." />
              <p className="text-[12px] text-[var(--ink-tertiary)]">Audio, video e posizione precisa non vengono mai registrati. Cancellazioni conservate come tombstone: {privacy.data.tombstones}.</p>
            </div>
          )}
        </GlassCard>

        <GlassCard className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-[var(--ink)]">Entità osservate (opt-in)</h2>
            <Badge>{ha.selected_entities.length} selezionate</Badge>
          </div>
          <p className="text-[12px] text-[var(--ink-tertiary)]">Solo ciò che spunti viene osservato e salvato. Indica anche i sensori di presenza, porta d’ingresso e finestre.</p>
          <div className="flex flex-wrap gap-2">
            <input className={cn(field, 'flex-1')} placeholder="Cerca entità" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cerca entità" />
            <ActionButton disabled={!candidates.data?.dashboard.length} onClick={() => set((n) => { n.sources.home_assistant.selected_entities = [...new Set([...n.sources.home_assistant.selected_entities, ...(candidates.data?.dashboard ?? [])])].slice(0, 1_000) })}>Usa i dispositivi attivi della dashboard</ActionButton>
          </div>
          {candidates.isPending ? <Loading what="delle entità" /> : list.length === 0 ? <p className="text-sm text-[var(--ink-secondary)]">Nessuna entità disponibile: Home Assistant non è raggiungibile o la ricerca non trova risultati.</p> : (
            <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
              {list.map((c) => (
                <li key={c.entity_id} className="flex flex-wrap items-center gap-2 rounded-[11px] bg-[var(--fill-subtle)] px-3 py-1.5">
                  <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input type="checkbox" className="h-5 w-5 accent-[var(--action-blue)]" checked={selected.has(c.entity_id)} onChange={(e) => toggleEntity(c.entity_id, e.target.checked)} />
                    <span className="min-w-0"><span className="block truncate text-sm text-[var(--ink)]">{c.label}</span><span className="block truncate text-[11px] text-[var(--ink-tertiary)]">{c.entity_id}</span></span>
                  </label>
                  <select aria-label={`Ruolo di ${c.label}`} className="min-h-11 rounded-[11px] border border-[var(--hairline)] bg-[var(--surface-solid)] px-2 text-xs text-[var(--ink)]" value={roleOf(c.entity_id)} onChange={(e) => setRole(c.entity_id, e.target.value as 'none' | 'presence' | 'door' | 'window')}>
                    <option value="none">Nessun ruolo</option><option value="presence">Presenza</option><option value="door">Porta d’ingresso</option><option value="window">Finestra</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-[var(--ink-tertiary)]">Ricorda di salvare le impostazioni dopo la selezione.</p>
        </GlassCard>

        <GlassCard className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">I tuoi dati</h2>
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={() => { void download() }}>Esporta (JSON locale)</ActionButton>
            <ActionButton tone="danger" disabled={forget.isPending} onClick={() => { if (window.confirm('Dimenticare TUTTO ciò che il core ha osservato e imparato? Le cancellazioni valgono anche per i backup ripristinati.')) forget.mutate({ entity_ids: [], subject_id: null, pattern_id: null, before: null, all: true }) }}>Dimentica tutto</ActionButton>
            {draft.runtime.demo && <ActionButton disabled={demo.isPending} onClick={() => demo.mutate('seed')}>Ricarica la demo</ActionButton>}
            <ActionButton disabled={demo.isPending} onClick={() => demo.mutate('clear')}>Rimuovi i dati demo</ActionButton>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
