import { useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Check, LayoutGrid, MapPin, RotateCcw, Search, WandSparkles,
} from 'lucide-react'
import { GlassSheet } from '../glass/GlassSheet'
import { DynamicIcon } from '../DynamicIcon'
import { EntityCard } from '../widgets/WidgetGrid'
import { makeRoomEntity } from '../home/layers/makeRoomEntity'
import { stateLabel } from '../widgets/utils/stateLabel'
import { useEntityStore } from '../../store/entities'
import { DOMAIN_TYPE } from '../../hooks/useDiscoveredEntities'
import { cn } from '../../lib/utils'
import { resolveAreaId } from '../../lib/areaInference'
import {
  applyDeviceSetup, DEVICE_CATEGORY_OPTIONS, type DeviceSetupSelection,
} from '../../lib/deviceSetup'
import { isCameraEntity, isConfiguredEntity } from '../../lib/entityVisibility'
import type { DeviceOverride, EntityType } from '../../api/backend'
import type { HAArea } from '../../api/ha-registry'

export interface DeviceSetupRegistryMeta {
  areaId?: string
  areaName?: string
  platform?: string
  haHidden: boolean
  category?: string
}

interface DeviceSetupWizardProps {
  open: boolean
  initialEntityId?: string
  areas: HAArea[]
  registryById?: Map<string, DeviceSetupRegistryMeta>
  overrides: Record<string, DeviceOverride>
  disabled: boolean
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  onSave: (entityId: string, selection: DeviceSetupSelection) => void
  /** Attivazione/disattivazione in blocco dallo stesso passaggio di scelta. */
  onBulkSave: (enable: string[], disable: string[]) => void
  onClose: () => void
}

const STEP_LABELS = ['Dispositivo', 'Categoria', 'Stanza', 'Verifica'] as const
const ACTIONABLE_DOMAINS = new Set([
  'light', 'switch', 'input_boolean', 'climate', 'cover', 'lock', 'fan', 'media_player',
  'camera', 'vacuum', 'lawn_mower', 'scene', 'script', 'alarm_control_panel', 'siren',
])

function categoryLabel(type: EntityType | undefined): string {
  return DEVICE_CATEGORY_OPTIONS.find((option) => option.value === type)?.label ?? 'Sensore valore'
}

export function DeviceSetupWizard({
  open,
  initialEntityId,
  areas,
  registryById,
  overrides,
  disabled,
  saveState,
  onSave,
  onBulkSave,
  onClose,
}: DeviceSetupWizardProps) {
  const entities = useEntityStore((state) => state.entities)
  const initialId = initialEntityId && entities[initialEntityId] ? initialEntityId : undefined
  const [step, setStep] = useState(initialId ? 1 : 0)
  const [entityId, setEntityId] = useState<string | undefined>(initialId)
  const [type, setType] = useState<EntityType | undefined>(() => initialId ? overrides[initialId]?.type : undefined)
  const [areaId, setAreaId] = useState<string | undefined>(() => initialId ? overrides[initialId]?.areaId : undefined)
  const [query, setQuery] = useState('')
  const [complete, setComplete] = useState(false)
  const [domainFilter, setDomainFilter] = useState('all')
  // La selezione parte da ciò che è già attivo: la stessa schermata serve ad
  // accendere i dispositivi nuovi e a spegnere quelli che non servono più.
  const initiallyEnabled = useMemo(
    () => new Set(Object.keys(overrides).filter((id) => isConfiguredEntity(id, overrides))),
    [overrides],
  )
  const [selected, setSelected] = useState<ReadonlySet<string>>(initiallyEnabled)
  const [bulkDone, setBulkDone] = useState<{ enabled: number; disabled: number } | null>(null)

  const toggleSelected = (entityId: string) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(entityId)) next.delete(entityId)
    else next.add(entityId)
    return next
  })

  const pendingEnable = [...selected].filter((id) => !initiallyEnabled.has(id)).sort()
  const pendingDisable = [...initiallyEnabled].filter((id) => !selected.has(id)).sort()
  const dirty = pendingEnable.length > 0 || pendingDisable.length > 0

  const begin = (nextEntityId: string, nextStep = 1) => {
    const current = overrides[nextEntityId]
    setEntityId(nextEntityId)
    setType(current?.type)
    setAreaId(current?.areaId)
    setComplete(false)
    setStep(nextStep)
  }

  const areaNameById = useMemo(
    () => new Map(areas.map((area) => [area.area_id, area.name])),
    [areas],
  )
  const selectedEntity = entityId ? entities[entityId] : undefined
  const selectedMeta = entityId ? registryById?.get(entityId) : undefined
  const automaticType = entityId ? DOMAIN_TYPE[entityId.split('.')[0]] ?? 'sensor' : undefined
  const automaticAreaId = selectedEntity
    ? resolveAreaId({
        entity: selectedEntity,
        areas,
        registryAreaId: selectedMeta?.areaId,
      })
    : undefined

  const domains = useMemo(
    () => [...new Set(Object.keys(entities).map((id) => id.split('.')[0]))].sort(),
    [entities],
  )

  const candidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('it')
    return Object.values(entities)
      .filter((entity) => domainFilter === 'all' || entity.entity_id.startsWith(`${domainFilter}.`))
      .filter((entity) => {
        if (!normalized) return true
        const name = String(entity.attributes?.friendly_name ?? '')
        return entity.entity_id.toLocaleLowerCase('it').includes(normalized)
          || name.toLocaleLowerCase('it').includes(normalized)
      })
      .sort((a, b) => {
        const domainA = a.entity_id.split('.')[0]
        const domainB = b.entity_id.split('.')[0]
        const actionDelta = Number(!ACTIONABLE_DOMAINS.has(domainA)) - Number(!ACTIONABLE_DOMAINS.has(domainB))
        if (actionDelta) return actionDelta
        const configuredDelta = Number(Boolean(overrides[a.entity_id]?.type && overrides[a.entity_id]?.areaId))
          - Number(Boolean(overrides[b.entity_id]?.type && overrides[b.entity_id]?.areaId))
        if (configuredDelta) return configuredDelta
        const nameA = String(a.attributes?.friendly_name ?? a.entity_id)
        const nameB = String(b.attributes?.friendly_name ?? b.entity_id)
        return nameA.localeCompare(nameB, 'it')
      })
  }, [entities, overrides, query, domainFilter])
  const visibleCandidates = candidates.slice(0, 60)

  const selectedName = selectedEntity
    ? String(selectedEntity.attributes?.friendly_name ?? selectedEntity.entity_id)
    : ''
  const selection: DeviceSetupSelection = { type, areaId }
  const previewOverrides = entityId
    ? { ...overrides, [entityId]: applyDeviceSetup(overrides[entityId], selection) }
    : overrides
  const selectedRoomLabel = areaId
    ? areaNameById.get(areaId) ?? areaId
    : automaticAreaId
      ? `Automatico · ${areaNameById.get(automaticAreaId) ?? automaticAreaId}`
      : 'Automatico · da assegnare'

  const resetForAnother = () => {
    setQuery('')
    setEntityId(undefined)
    setType(undefined)
    setAreaId(undefined)
    setComplete(false)
    setStep(0)
  }

  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      title="Configura dispositivo"
      side="center"
      wide
      className="max-h-[min(90dvh,820px)]"
    >
      <div className="space-y-5 pb-1">
        <div className="rounded-[20px] bg-white/55 p-2 ring-1 ring-black/5">
          <div className="grid grid-cols-4 gap-1" aria-label="Avanzamento configurazione">
            {STEP_LABELS.map((label, index) => {
              const active = !complete && step === index
              const done = complete || step > index
              return (
                <div
                  key={label}
                  className={cn(
                    'flex min-h-[42px] items-center justify-center gap-1.5 rounded-[14px] px-2 text-center text-[11px] font-semibold transition',
                    active ? 'bg-[#0066cc] text-white shadow-sm' : done ? 'bg-[#0066cc]/10 text-[#0066cc]' : 'text-black/35',
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]', active ? 'bg-white/20' : done ? 'bg-[#0066cc]/12' : 'bg-black/[0.05]')}>
                    {done ? <Check size={12} /> : index + 1}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {complete && bulkDone ? (
          <BulkDoneScreen
            enabled={bulkDone.enabled}
            disabled={bulkDone.disabled}
            saveState={saveState}
            onAnother={() => { setBulkDone(null); setComplete(false) }}
            onClose={onClose}
          />
        ) : complete && entityId ? (
          <div className="flex min-h-[430px] flex-col items-center justify-center px-4 text-center">
            <div className={cn(
              'flex h-20 w-20 items-center justify-center rounded-[28px]',
              saveState === 'error' ? 'bg-red-500/10 text-red-600' : 'bg-[#34c759]/12 text-[#248a3d]',
            )}>
              {saveState === 'error' ? <RotateCcw size={32} /> : <Check size={36} />}
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-[#1d1d1f]">
              {saveState === 'error' ? 'Salvataggio non riuscito' : 'Dispositivo configurato'}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-black/45">
              {saveState === 'saving'
                ? `Sto salvando categoria e stanza di ${selectedName}.`
                : saveState === 'error'
                  ? 'Le scelte restano nel wizard: puoi riprovare senza ricominciare.'
                  : `${selectedName} userà la card ${type ? categoryLabel(type) : `${categoryLabel(automaticType)} automatica`} in ${selectedRoomLabel}.`}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              {saveState === 'error' && (
                <button
                  type="button"
                  onClick={() => onSave(entityId, selection)}
                  className="flex min-h-[48px] items-center gap-2 rounded-full bg-red-600 px-5 text-sm font-semibold text-white active:scale-95"
                >
                  <RotateCcw size={16} /> Riprova
                </button>
              )}
              <button
                type="button"
                onClick={resetForAnother}
                className="flex min-h-[48px] items-center gap-2 rounded-full bg-[#0066cc] px-5 text-sm font-semibold text-white active:scale-95"
              >
                <WandSparkles size={16} /> Configura un altro
              </button>
              <button type="button" onClick={onClose} className="min-h-[48px] rounded-full bg-black/[0.07] px-5 text-sm font-semibold text-black/60 active:scale-95">
                Fine
              </button>
            </div>
          </div>
        ) : step === 0 ? (
          <section aria-labelledby="wizard-device-title">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0066cc]">Passaggio 1</p>
              <h2 id="wizard-device-title" className="mt-1 text-2xl font-semibold text-[#1d1d1f]">Quali dispositivi vuoi in casa?</h2>
              <p className="mt-1 text-sm text-black/45">
                La dashboard parte vuota: compare solo ciò che spunti qui. Puoi sceglierne quanti vuoi in una volta.
              </p>
            </div>

            <div className="relative">
              <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-black/35" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="es. luce cucina, climate…"
                aria-label="Cerca dispositivo da configurare"
                className="min-h-[52px] w-full rounded-[18px] border border-black/10 bg-white pl-11 pr-4 text-base text-[#1d1d1f] outline-none focus:border-[#0066cc]"
              />
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Filtra per tipo">
              <FilterChip label="Tutti" active={domainFilter === 'all'} onClick={() => setDomainFilter('all')} />
              {domains.map((domain) => (
                <FilterChip key={domain} label={domain} active={domainFilter === domain} onClick={() => setDomainFilter(domain)} />
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 px-1">
              <p className="text-xs text-black/45" aria-live="polite">
                {selected.size} attivi · {candidates.length} disponibili
              </p>
              <button
                type="button"
                onClick={() => setSelected((current) => {
                  const next = new Set(current)
                  const ids = visibleCandidates.map((entity) => entity.entity_id)
                  const allOn = ids.every((id) => next.has(id))
                  for (const id of ids) { if (allOn) next.delete(id); else next.add(id) }
                  return next
                })}
                className="min-h-[36px] rounded-full bg-black/[0.06] px-3 text-xs font-semibold text-black/55 active:scale-95"
              >
                {visibleCandidates.every((entity) => selected.has(entity.entity_id)) && visibleCandidates.length > 0
                  ? 'Deseleziona questi'
                  : 'Seleziona questi'}
              </button>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {visibleCandidates.map((entity) => {
                const id = entity.entity_id
                const current = overrides[id]
                const meta = registryById?.get(id)
                const domainType = DOMAIN_TYPE[id.split('.')[0]]
                const autoRoom = resolveAreaId({ entity, areas, registryAreaId: meta?.areaId })
                const roomLabel = current?.areaId
                  ? areaNameById.get(current.areaId) ?? current.areaId
                  : autoRoom ? areaNameById.get(autoRoom) ?? autoRoom : 'Nessuna stanza'
                const on = selected.has(id)
                return (
                  <div
                    key={id}
                    className={cn(
                      'flex min-h-[72px] items-center gap-2 rounded-[18px] px-2.5 py-2 ring-1 transition',
                      on ? 'bg-[#0066cc]/8 ring-[#0066cc]/35' : 'bg-white/72 ring-black/5',
                    )}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleSelected(id)}
                      aria-label={`${on ? 'Rimuovi' : 'Aggiungi'} ${String(entity.attributes?.friendly_name ?? id)}`}
                      className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] transition active:scale-95',
                        on ? 'bg-[#0066cc] text-white' : 'bg-black/[0.05] text-[#0066cc]',
                      )}
                    >
                      {on ? <Check size={20} /> : <DynamicIcon name={DEVICE_CATEGORY_OPTIONS.find((option) => option.value === (current?.type ?? domainType))?.icon} fallback={LayoutGrid} size={20} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => begin(id)}
                      className="min-w-0 flex-1 py-1 text-left"
                      aria-label={`Configura in dettaglio ${String(entity.attributes?.friendly_name ?? id)}`}
                    >
                      <span className="block truncate text-sm font-semibold text-[#1d1d1f]">{String(entity.attributes?.friendly_name ?? id)}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-black/40">
                        {categoryLabel(current?.type ?? domainType)} · {roomLabel} · {stateLabel(entity.state)}
                      </span>
                      <span className="block truncate font-mono text-[9px] text-black/25">
                        {isCameraEntity(id) ? 'video · solo nella tendina videocamere' : id}
                      </span>
                    </button>
                    <ArrowRight size={16} className="shrink-0 text-black/25" aria-hidden="true" />
                  </div>
                )
              })}
            </div>
            {visibleCandidates.length === 0 && <p className="py-10 text-center text-sm text-black/40">Nessun dispositivo corrisponde alla ricerca.</p>}
            {candidates.length > visibleCandidates.length && (
              <p className="mt-3 text-center text-xs text-black/35">Mostrati {visibleCandidates.length} di {candidates.length}: restringi la ricerca o filtra per tipo.</p>
            )}

            <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.07] bg-white/72 pt-3 backdrop-blur">
              <p className="text-xs text-black/45">
                {dirty
                  ? `${pendingEnable.length} da attivare · ${pendingDisable.length} da rimuovere`
                  : 'Nessuna modifica in sospeso'}
              </p>
              <button
                type="button"
                disabled={disabled || !dirty || saveState === 'saving'}
                onClick={() => {
                  onBulkSave(pendingEnable, pendingDisable)
                  setBulkDone({ enabled: pendingEnable.length, disabled: pendingDisable.length })
                  setComplete(true)
                }}
                className="flex min-h-[48px] items-center gap-2 rounded-full bg-[#0066cc] px-6 text-sm font-semibold text-white active:scale-95 disabled:opacity-45"
              >
                <Check size={16} /> Applica
              </button>
            </div>
          </section>
        ) : step === 1 && entityId ? (
          <section aria-labelledby="wizard-category-title">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0066cc]">Passaggio 2 · {selectedName}</p>
              <h2 id="wizard-category-title" className="mt-1 text-2xl font-semibold text-[#1d1d1f]">Che tipo di card deve usare?</h2>
              <p className="mt-1 text-sm text-black/45">La categoria decide informazioni, controlli e comportamento del widget.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4" role="radiogroup" aria-label="Categoria dispositivo">
              <button
                type="button"
                role="radio"
                aria-checked={!type}
                onClick={() => setType(undefined)}
                className={cn('flex min-h-[82px] items-center gap-3 rounded-[18px] p-3 text-left ring-1 transition', !type ? 'bg-[#0066cc] text-white ring-[#0066cc]' : 'bg-white/70 text-[#1d1d1f] ring-black/5')}
              >
                <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]', !type ? 'bg-white/18' : 'bg-black/[0.05] text-[#0066cc]')}><WandSparkles size={20} /></span>
                <span><span className="block text-sm font-semibold">Automatica</span><span className={cn('mt-0.5 block text-[11px]', !type ? 'text-white/70' : 'text-black/40')}>Rilevata: {categoryLabel(automaticType)}</span></span>
              </button>
              {DEVICE_CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={type === option.value}
                  onClick={() => setType(option.value)}
                  className={cn('flex min-h-[82px] items-center gap-3 rounded-[18px] p-3 text-left ring-1 transition', type === option.value ? 'bg-[#0066cc] text-white ring-[#0066cc]' : 'bg-white/70 text-[#1d1d1f] ring-black/5 hover:ring-[#0066cc]/30')}
                >
                  <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]', type === option.value ? 'bg-white/18' : 'bg-black/[0.05] text-[#0066cc]')}><DynamicIcon name={option.icon} fallback={LayoutGrid} size={20} /></span>
                  <span className="min-w-0"><span className="block text-sm font-semibold">{option.label}</span><span className={cn('mt-0.5 block text-[11px] leading-tight', type === option.value ? 'text-white/70' : 'text-black/40')}>{option.description}</span></span>
                </button>
              ))}
            </div>
          </section>
        ) : step === 2 && entityId ? (
          <section aria-labelledby="wizard-room-title">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0066cc]">Passaggio 3 · {selectedName}</p>
              <h2 id="wizard-room-title" className="mt-1 text-2xl font-semibold text-[#1d1d1f]">In quale stanza si trova?</h2>
              <p className="mt-1 text-sm text-black/45">La scelta manuale prevale sul registry HA e organizza tutte le viste kiosk.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Stanza dispositivo">
              <button
                type="button"
                role="radio"
                aria-checked={!areaId}
                onClick={() => setAreaId(undefined)}
                className={cn('flex min-h-[92px] items-center gap-4 rounded-[20px] p-4 text-left ring-1 transition', !areaId ? 'bg-[#0066cc] text-white ring-[#0066cc]' : 'bg-white/72 text-[#1d1d1f] ring-black/5')}
              >
                <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px]', !areaId ? 'bg-white/18' : 'bg-black/[0.05] text-[#0066cc]')}><WandSparkles size={22} /></span>
                <span><span className="block text-base font-semibold">Automatica</span><span className={cn('mt-0.5 block text-xs', !areaId ? 'text-white/70' : 'text-black/40')}>{automaticAreaId ? `Ora rilevata: ${areaNameById.get(automaticAreaId) ?? automaticAreaId}` : 'Nessuna stanza rilevata'}</span></span>
              </button>
              {areas.map((room) => (
                <button
                  key={room.area_id}
                  type="button"
                  role="radio"
                  aria-checked={areaId === room.area_id}
                  onClick={() => setAreaId(room.area_id)}
                  className={cn('flex min-h-[92px] items-center gap-4 rounded-[20px] p-4 text-left ring-1 transition', areaId === room.area_id ? 'bg-[#0066cc] text-white ring-[#0066cc]' : 'bg-white/72 text-[#1d1d1f] ring-black/5 hover:ring-[#0066cc]/30')}
                >
                  <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px]', areaId === room.area_id ? 'bg-white/18' : 'bg-black/[0.05] text-[#0066cc]')}><MapPin size={22} /></span>
                  <span><span className="block text-base font-semibold">{room.name}</span><span className={cn('mt-0.5 block text-xs', areaId === room.area_id ? 'text-white/70' : 'text-black/40')}>{selectedMeta?.areaId === room.area_id ? 'Stanza registrata in HA' : 'Assegnazione MyHome'}</span></span>
                </button>
              ))}
            </div>
            {areas.length === 0 && <p className="mt-3 rounded-[16px] bg-orange-500/10 p-3 text-sm text-orange-700">Il registry non espone ancora stanze. Puoi lasciare Automatico e riprovare quando Home Assistant sarà connesso.</p>}
          </section>
        ) : step === 3 && entityId && selectedEntity ? (
          <section aria-labelledby="wizard-review-title">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0066cc]">Passaggio 4</p>
              <h2 id="wizard-review-title" className="mt-1 text-2xl font-semibold text-[#1d1d1f]">Controlla il risultato</h2>
              <p className="mt-1 text-sm text-black/45">La preview usa già categoria e stanza scelte, senza cambiare le altre preferenze della card.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(260px,.85fr)]">
              <div className="min-h-[250px] overflow-hidden rounded-[24px] bg-[#e9eef5] p-3 ring-1 ring-black/5">
                <EntityCard entity={makeRoomEntity(entityId, entities, previewOverrides)} size="XL" preview />
              </div>
              <div className="space-y-2">
                <ReviewItem icon="layout-grid" label="Categoria card" value={type ? categoryLabel(type) : `${categoryLabel(automaticType)} · automatica`} />
                <ReviewItem icon="map-pin" label="Stanza" value={selectedRoomLabel} />
                <ReviewItem icon="radio" label="Stato live" value={stateLabel(selectedEntity.state)} />
                <ReviewItem icon="database" label="Sorgente" value={selectedMeta?.platform ?? 'Home Assistant'} />
              </div>
            </div>
          </section>
        ) : null}

        {!complete && step > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-black/[0.07] pt-4">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              className="flex min-h-[48px] items-center gap-2 rounded-full bg-black/[0.07] px-5 text-sm font-semibold text-black/60 active:scale-95"
            >
              <ArrowLeft size={16} /> Indietro
            </button>
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((current) => Math.min(3, current + 1))}
                className="flex min-h-[48px] items-center gap-2 rounded-full bg-[#0066cc] px-5 text-sm font-semibold text-white active:scale-95"
              >
                Continua <ArrowRight size={16} />
              </button>
            ) : entityId ? (
              <button
                type="button"
                disabled={disabled || saveState === 'saving'}
                onClick={() => { onSave(entityId, selection); setComplete(true) }}
                className="flex min-h-[48px] items-center gap-2 rounded-full bg-[#0066cc] px-6 text-sm font-semibold text-white active:scale-95 disabled:opacity-45"
              >
                <Check size={16} /> Salva configurazione
              </button>
            ) : null}
          </div>
        )}
      </div>
    </GlassSheet>
  )
}

function BulkDoneScreen({
  enabled, disabled, saveState, onAnother, onClose,
}: {
  enabled: number
  disabled: number
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  onAnother: () => void
  onClose: () => void
}) {
  return (
    <div className="flex min-h-[430px] flex-col items-center justify-center px-4 text-center">
      <div className={cn(
        'flex h-20 w-20 items-center justify-center rounded-[28px]',
        saveState === 'error' ? 'bg-red-500/10 text-red-600' : 'bg-[#34c759]/12 text-[#248a3d]',
      )}>
        {saveState === 'error' ? <RotateCcw size={32} /> : <Check size={36} />}
      </div>
      <h2 className="mt-5 text-2xl font-semibold text-[#1d1d1f]">
        {saveState === 'error' ? 'Salvataggio non riuscito' : 'Casa aggiornata'}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-black/45">
        {saveState === 'error'
          ? 'Le scelte restano nel wizard: puoi riprovare senza ricominciare.'
          : [
            enabled > 0 && `${enabled} ${enabled === 1 ? 'dispositivo attivato' : 'dispositivi attivati'}`,
            disabled > 0 && `${disabled} ${disabled === 1 ? 'rimosso' : 'rimossi'}`,
          ].filter(Boolean).join(' · ') || 'Nessuna modifica applicata.'}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onAnother} className="flex min-h-[48px] items-center gap-2 rounded-full bg-[#0066cc] px-5 text-sm font-semibold text-white active:scale-95">
          <WandSparkles size={16} /> Continua a scegliere
        </button>
        <button type="button" onClick={onClose} className="min-h-[48px] rounded-full bg-black/[0.07] px-5 text-sm font-semibold text-black/60 active:scale-95">
          Fine
        </button>
      </div>
    </div>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-[36px] rounded-full px-3 text-xs font-semibold transition active:scale-95',
        active ? 'bg-[#0066cc] text-white' : 'bg-black/[0.05] text-black/55',
      )}
    >
      {label}
    </button>
  )
}

function ReviewItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex min-h-[58px] items-center gap-3 rounded-[16px] bg-white/72 px-3 py-2 ring-1 ring-black/5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#0066cc]/10 text-[#0066cc]"><DynamicIcon name={icon} fallback={LayoutGrid} size={18} /></span>
      <span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-black/30">{label}</span><span className="mt-0.5 block truncate text-sm font-semibold text-[#1d1d1f]">{value}</span></span>
    </div>
  )
}
