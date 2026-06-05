import { useMemo, useState } from 'react'
import type { ElementType, MouseEvent } from 'react'
import type { HassEntity } from 'home-assistant-js-websocket'
import { Activity, AlertTriangle, Camera, ChevronRight, Droplets, Film, Lightbulb, Power, Search, Settings2, ShieldCheck, ToggleRight, Waves, Zap } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { SectionBand } from '../home/SectionBand'
import { useEntityStore } from '../../store/entities'
import { useUIStore } from '../../store/ui'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { timeAgo } from '../../lib/time'
import { cn } from '../../lib/utils'

interface EntityCollectionPageProps {
  title: string
  subtitle: string
  domains?: string[]
  keywords?: string[]
  emptyText?: string
}

const DOMAIN_LABEL: Record<string, string> = {
  light: 'Luci',
  switch: 'Interruttori',
  input_boolean: 'Booleani',
  climate: 'Clima',
  cover: 'Cover',
  lock: 'Serrature',
  alarm_control_panel: 'Allarme',
  camera: 'Telecamere',
  media_player: 'Media',
  fan: 'Ventilazione',
  vacuum: 'Robot',
  button: 'Pulsanti',
  scene: 'Scene',
  script: 'Script',
  automation: 'Automazioni',
  sensor: 'Sensori',
  binary_sensor: 'Sensori stato',
  number: 'Numeri',
  input_number: 'Input numeri',
  select: 'Selettori',
  person: 'Persone',
  device_tracker: 'Tracker',
  weather: 'Meteo',
  water_heater: 'Acqua calda',
  valve: 'Valvole',
}

const DOMAIN_ICON: Record<string, ElementType> = {
  light: Lightbulb,
  switch: ToggleRight,
  input_boolean: ToggleRight,
  climate: Waves,
  cover: Activity,
  lock: ShieldCheck,
  alarm_control_panel: ShieldCheck,
  camera: Camera,
  media_player: Film,
  fan: Activity,
  vacuum: Activity,
  button: Power,
  scene: Zap,
  script: Zap,
  automation: Settings2,
  sensor: Activity,
  binary_sensor: Activity,
  weather: Droplets,
  water_heater: Droplets,
  valve: Droplets,
}

const TOGGLE_DOMAINS = new Set(['light', 'switch', 'input_boolean', 'fan', 'automation'])

function entityName(entity: HassEntity): string {
  return (entity.attributes?.friendly_name as string | undefined) ?? entity.entity_id
}

function entityDomain(entity: HassEntity): string {
  return entity.entity_id.split('.')[0]
}

function matchesKeyword(entity: HassEntity, keywords: string[]): boolean {
  if (keywords.length === 0) return true
  const haystack = `${entity.entity_id} ${entityName(entity)} ${entity.attributes?.device_class ?? ''}`.toLowerCase()
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
}

function normalizeState(state: string): { label: string; tone: 'ok' | 'active' | 'warning' | 'critical' | 'muted' } {
  if (state === 'unavailable' || state === 'unknown') return { label: 'Non disponibile', tone: 'warning' }
  if (state === 'on' || state === 'open' || state === 'opening' || state === 'playing' || state === 'running' || state === 'home') return { label: state, tone: 'active' }
  if (state === 'triggered' || state === 'alarm') return { label: state, tone: 'critical' }
  if (state === 'off' || state === 'closed' || state === 'idle' || state === 'standby') return { label: state, tone: 'muted' }
  return { label: state, tone: 'ok' }
}

function toneClasses(tone: ReturnType<typeof normalizeState>['tone']) {
  if (tone === 'critical') return 'bg-red-500/15 text-red-700'
  if (tone === 'warning') return 'bg-orange-500/15 text-orange-700'
  if (tone === 'active') return 'bg-[#0066cc]/12 text-[#0066cc]'
  if (tone === 'muted') return 'bg-black/6 text-black/45'
  return 'bg-green-500/12 text-green-700'
}

export function EntityCollectionPage({ title, subtitle, domains, keywords = [], emptyText }: EntityCollectionPageProps) {
  const entities = useEntityStore((s) => s.entities)
  const connectionStatus = useEntityStore((s) => s.connectionStatus)
  const [query, setQuery] = useState('')
  const [activeDomain, setActiveDomain] = useState<string>('all')

  const allEntities = useMemo(() => {
    const allowed = domains ? new Set(domains) : null
    const q = query.trim().toLowerCase()
    return Object.values(entities)
      .filter((entity) => !allowed || allowed.has(entityDomain(entity)))
      .filter((entity) => matchesKeyword(entity, keywords))
      .filter((entity) => activeDomain === 'all' || entityDomain(entity) === activeDomain)
      .filter((entity) => {
        if (!q) return true
        const name = entityName(entity).toLowerCase()
        return name.includes(q) || entity.entity_id.toLowerCase().includes(q)
      })
      .sort((a, b) => entityName(a).localeCompare(entityName(b)))
  }, [entities, domains, keywords, activeDomain, query])

  const domainCounts = useMemo(() => {
    const allowed = domains ? new Set(domains) : null
    const counts = new Map<string, number>()
    Object.values(entities)
      .filter((entity) => !allowed || allowed.has(entityDomain(entity)))
      .filter((entity) => matchesKeyword(entity, keywords))
      .forEach((entity) => {
        const domain = entityDomain(entity)
        counts.set(domain, (counts.get(domain) ?? 0) + 1)
      })
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [entities, domains, keywords])

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-[#1d1d1f] sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-black/45">{subtitle}</p>
      </div>

      <div className="flex shrink-0 flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca entità"
            className="w-full rounded-full border border-black/10 bg-white/80 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#0066cc]"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          <FilterPill active={activeDomain === 'all'} label="Tutto" count={domainCounts.reduce((n, [, c]) => n + c, 0)} onClick={() => setActiveDomain('all')} />
          {domainCounts.map(([domain, count]) => (
            <FilterPill key={domain} active={activeDomain === domain} label={DOMAIN_LABEL[domain] ?? domain} count={count} onClick={() => setActiveDomain(domain)} />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <SectionBand title={activeDomain === 'all' ? title : DOMAIN_LABEL[activeDomain] ?? activeDomain} count={allEntities.length}>
          {allEntities.length === 0 ? (
            <p className="col-span-full py-8 text-center text-sm text-black/40">
              {connectionStatus === 'connected' ? emptyText ?? 'Nessuna entità trovata' : 'In attesa di Home Assistant'}
            </p>
          ) : (
            allEntities.map((entity) => <SmartEntityCard key={entity.entity_id} entity={entity} />)
          )}
        </SectionBand>
      </div>
    </div>
  )
}

function FilterPill({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition active:scale-95',
        active ? 'bg-[#0066cc] text-white' : 'bg-black/6 text-black/55 hover:bg-black/10',
      )}
    >
      <span>{label}</span>
      <span className={cn('rounded-full px-1.5 text-[10px]', active ? 'bg-white/25 text-white' : 'bg-black/8 text-black/40')}>{count}</span>
    </button>
  )
}

function SmartEntityCard({ entity }: { entity: HassEntity }) {
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const { call } = useHAService()
  const { light } = useHaptic()
  const domain = entityDomain(entity)
  const Icon = DOMAIN_ICON[domain] ?? Activity
  const name = entityName(entity)
  const state = normalizeState(entity.state)
  const unit = entity.attributes?.unit_of_measurement as string | undefined
  const primary = unit ? `${entity.state} ${unit}` : state.label
  const unavailable = entity.state === 'unavailable' || entity.state === 'unknown'
  const isToggle = TOGGLE_DOMAINS.has(domain)
  const isOn = entity.state === 'on'

  const toggle = (event: MouseEvent) => {
    event.stopPropagation()
    if (!isToggle || unavailable) return
    light()
    const nextState = isOn ? 'off' : 'on'
    const service = isOn ? 'turn_off' : 'turn_on'
    setOptimisticState(entity.entity_id, nextState)
    call(domain, service, { entity_id: entity.entity_id }).catch(() => setOptimisticState(entity.entity_id, entity.state))
  }

  return (
    <GlassCard
      interactive
      onClick={() => setSelectedEntity(entity.entity_id)}
      className={cn('min-h-[132px] p-0', unavailable && 'opacity-60')}
    >
      <div className="flex h-full flex-col gap-3 p-[14px]">
        <div className="flex items-start justify-between gap-2">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', toneClasses(state.tone))}>
            <Icon size={18} />
          </div>
          {isToggle ? (
            <button
              type="button"
              onClick={toggle}
              className={cn('lg-toggle widget-edit-control', isOn && 'on')}
              aria-label={`${isOn ? 'Spegni' : 'Accendi'} ${name}`}
            >
              <span className="lg-toggle-knob" />
            </button>
          ) : (
            <ChevronRight size={17} className="mt-2 text-black/30" />
          )}
        </div>
        <div className="mt-auto min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-black/90">{name}</p>
          <p className="mt-1 truncate text-xs text-black/42">{primary}</p>
          <p className="mt-2 truncate font-mono text-[10px] text-black/30">{timeAgo(entity.last_updated)} · {entity.entity_id}</p>
        </div>
        {state.tone === 'critical' && <AlertTriangle size={14} className="absolute bottom-3 right-3 text-red-600" />}
      </div>
    </GlassCard>
  )
}
