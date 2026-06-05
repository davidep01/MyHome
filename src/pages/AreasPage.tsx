import { useMemo, useState } from 'react'
import type { RoomEntity } from '../api/backend'
import { useDiscoveredEntities } from '../hooks/useDiscoveredEntities'
import { useEntityStore } from '../store/entities'
import { SectionBand } from '../components/home/SectionBand'
import { WidgetGrid } from '../components/widgets/WidgetGrid'
import { cn } from '../lib/utils'

const DOMAIN_ICON: Record<string, string> = {
  light: '💡',
  switch: '🔌',
  input_boolean: '🔌',
  fan: '💨',
  climate: '🌡️',
  cover: '🪟',
  lock: '🔒',
  vacuum: '🤖',
  media_player: '🎵',
  camera: '📹',
  scene: '🎬',
  alarm_control_panel: '🛡️',
  sensor: '📊',
}

/**
 * Extracts a "location" keyword from a friendly_name by stripping common
 * type words, then returning the first remaining meaningful word.
 *
 * "Luce Soggiorno Lampada" → "Soggiorno"
 * "Clima Camera"           → "Camera"
 * "Robot Aspirapolvere"    → undefined  (too generic, no clear location)
 */
const TYPE_WORDS = new Set([
  'luce', 'luci', 'lampada', 'lampadina', 'led',
  'clima', 'termostato', 'riscaldamento', 'raffreddamento',
  'tapparella', 'tenda', 'tapparelle', 'tende', 'persiana',
  'serratura', 'cancello', 'cancelletto', 'porta',
  'robot', 'aspirapolvere', 'roomba',
  'sensore', 'sensor', 'rilevatore',
  'allarme', 'antifurto',
  'interruttore', 'switch', 'presa',
  'videocamera', 'camera', 'telecamera',
  'media', 'musica', 'altoparlante', 'speaker', 'tv',
  'scena', 'scene',
  'ventilatore', 'fan',
])

function extractLocation(label: string): string | undefined {
  const words = label
    .toLowerCase()
    .replace(/[^a-zàèéìòù0-9 ]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !TYPE_WORDS.has(w))
  return words[0]
    ? words[0].charAt(0).toUpperCase() + words[0].slice(1)
    : undefined
}

interface SubGroup {
  location: string
  entities: RoomEntity[]
}

function buildSubGroups(entities: RoomEntity[]): SubGroup[] {
  const map = new Map<string, RoomEntity[]>()
  for (const e of entities) {
    const loc = extractLocation(e.label) ?? '—'
    const list = map.get(loc) ?? []
    list.push(e)
    map.set(loc, list)
  }
  // If everything lands in one group, don't sub-group (no meaningful location found)
  if (map.size === 1 && map.has('—')) return []
  return Array.from(map.entries())
    .map(([location, ents]) => ({ location, entities: ents }))
    .sort((a, b) => a.location.localeCompare(b.location))
}

export function AreasPage() {
  const { sections } = useDiscoveredEntities()
  const status = useEntityStore((s) => s.connectionStatus)
  const [active, setActive] = useState<string | null>(null)

  const current = active ?? sections[0]?.domain
  const section = sections.find((s) => s.domain === current) ?? sections[0]

  const subGroups = useMemo(
    () => (section ? buildSubGroups(section.entities) : []),
    [section],
  )

  if (sections.length === 0) {
    return (
      <div className="flex h-full flex-col gap-5 overflow-y-auto pr-1">
        <Header subtitle="Plance per tipologia" />
        <p className="px-1 text-sm text-black/40">
          {status === 'connected'
            ? 'Nessun dispositivo controllabile esposto da Home Assistant.'
            : status === 'connecting'
              ? 'Connessione a Home Assistant…'
              : 'In attesa di Home Assistant — verifica la connessione.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <Header subtitle={`${section?.label ?? ''} · ${section?.entities.length ?? 0} dispositivi`} />

      {/* Domain tab pills */}
      <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
        {sections.map((s) => (
          <button
            key={s.domain}
            onClick={() => setActive(s.domain)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition active:scale-95',
              current === s.domain
                ? 'bg-[#0066cc] text-white shadow-sm'
                : 'bg-black/6 text-black/55 hover:bg-black/10 hover:text-[#1d1d1f]',
            )}
          >
            <span>{DOMAIN_ICON[s.domain] ?? '•'}</span>
            <span>{s.label}</span>
            <span className={cn(
              'rounded-full px-1.5 py-0 text-[10px] font-semibold',
              current === s.domain ? 'bg-white/25 text-white' : 'bg-black/8 text-black/40',
            )}>
              {s.entities.length}
            </span>
          </button>
        ))}
      </div>

      {/* Entity grid — sub-grouped by name if locations are detectable, else flat */}
      <div className="flex-1 overflow-y-auto">
        {section && (
          subGroups.length > 0 ? (
            <div className="flex flex-col gap-5">
              {subGroups.map((g) => (
                <SectionBand key={g.location} title={g.location} count={g.entities.length}>
                  <WidgetGrid entities={g.entities} />
                </SectionBand>
              ))}
            </div>
          ) : (
            <SectionBand title={section.label} count={section.entities.length}>
              <WidgetGrid entities={section.entities} />
            </SectionBand>
          )
        )}
      </div>
    </div>
  )
}

function Header({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-[#1d1d1f] sm:text-3xl">Dispositivi</h1>
      <p className="mt-1 text-sm text-black/45">{subtitle}</p>
    </div>
  )
}
