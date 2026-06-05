import { useMemo } from 'react'
import type { ElementType } from 'react'
import { AlertTriangle, CheckCircle2, Database, HardDrive, Server, WifiOff } from 'lucide-react'
import { GlassCard } from '../components/glass/GlassCard'
import { SectionBand } from '../components/home/SectionBand'
import { useEntityStore } from '../store/entities'
import { timeAgo } from '../lib/time'
import { cn } from '../lib/utils'

const SYSTEM_KEYWORDS = [
  'cpu',
  'processor',
  'ram',
  'memory',
  'memoria',
  'disk',
  'disco',
  'uptime',
  'backup',
  'mqtt',
  'zigbee',
  'esphome',
  'frigate',
  'scrypted',
  'node-red',
  'node red',
  'home assistant',
  'ha',
  'update',
  'aggiornamento',
]

function label(entity: { entity_id: string; attributes?: Record<string, unknown> }) {
  return (entity.attributes?.friendly_name as string | undefined) ?? entity.entity_id
}

function isSystemEntity(entity: { entity_id: string; attributes?: Record<string, unknown> }) {
  const text = `${entity.entity_id} ${label(entity)} ${entity.attributes?.device_class ?? ''}`.toLowerCase()
  return SYSTEM_KEYWORDS.some((keyword) => text.includes(keyword))
}

export function SystemPage() {
  const entities = useEntityStore((s) => s.entities)
  const connectionStatus = useEntityStore((s) => s.connectionStatus)
  const lastError = useEntityStore((s) => s.lastError)

  const all = Object.values(entities)
  const unavailable = useMemo(
    () => all.filter((entity) => entity.state === 'unavailable' || entity.state === 'unknown').sort((a, b) => label(a).localeCompare(label(b))),
    [all],
  )
  const diagnostics = useMemo(
    () => all.filter((entity) => entity.entity_id.startsWith('sensor.') && isSystemEntity(entity)).sort((a, b) => label(a).localeCompare(label(b))).slice(0, 24),
    [all],
  )

  const connected = connectionStatus === 'connected'

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto pr-1">
      <div>
        <h1 className="text-2xl font-semibold text-[#1d1d1f] sm:text-3xl">Sistema</h1>
        <p className="mt-1 text-sm text-black/45">Home Assistant, add-on, diagnostica e disponibilità</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard Icon={connected ? CheckCircle2 : WifiOff} label="Home Assistant" value={connected ? 'Online' : connectionStatus} tone={connected ? 'ok' : 'warning'} />
        <MetricCard Icon={Server} label="Entità" value={String(all.length)} tone="neutral" />
        <MetricCard Icon={AlertTriangle} label="Unavailable" value={String(unavailable.length)} tone={unavailable.length ? 'warning' : 'ok'} />
        <MetricCard Icon={Database} label="Storage" value="File" tone="neutral" />
      </div>

      {lastError && (
        <GlassCard className="border-red-500/20 bg-red-500/10">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-700">Errore connessione</p>
              <p className="mt-1 text-xs text-red-700/70">{lastError}</p>
            </div>
          </div>
        </GlassCard>
      )}

      <SectionBand title="Diagnostica" count={diagnostics.length}>
        {diagnostics.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-black/40">Nessun sensore diagnostico rilevato</p>
        ) : (
          diagnostics.map((entity) => <DiagnosticCard key={entity.entity_id} entity={entity} />)
        )}
      </SectionBand>

      <SectionBand title="Entità non disponibili" count={unavailable.length}>
        {unavailable.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-black/40">Tutte le entità principali risultano disponibili</p>
        ) : (
          unavailable.slice(0, 36).map((entity) => <DiagnosticCard key={entity.entity_id} entity={entity} warning />)
        )}
      </SectionBand>
    </div>
  )
}

function MetricCard({ Icon, label, value, tone }: { Icon: ElementType; label: string; value: string; tone: 'ok' | 'warning' | 'neutral' }) {
  return (
    <GlassCard className="min-h-[110px]">
      <div className="flex h-full flex-col justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', tone === 'ok' ? 'bg-green-500/12 text-green-700' : tone === 'warning' ? 'bg-orange-500/14 text-orange-700' : 'bg-black/6 text-black/55')}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-xs text-black/40">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold text-[#1d1d1f]">{value}</p>
        </div>
      </div>
    </GlassCard>
  )
}

function DiagnosticCard({ entity, warning = false }: { entity: { entity_id: string; state: string; last_updated?: string; attributes?: Record<string, unknown> }; warning?: boolean }) {
  const unit = entity.attributes?.unit_of_measurement as string | undefined
  return (
    <GlassCard className={cn('min-h-[112px]', warning && 'bg-orange-500/8')}>
      <div className="flex items-start gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', warning ? 'bg-orange-500/14 text-orange-700' : 'bg-black/6 text-black/50')}>
          {warning ? <AlertTriangle size={16} /> : <HardDrive size={16} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-black/85">{label(entity)}</p>
          <p className="mt-1 truncate text-xs text-black/42">{entity.state}{unit ? ` ${unit}` : ''}</p>
          <p className="mt-2 truncate font-mono text-[10px] text-black/30">{timeAgo(entity.last_updated)} · {entity.entity_id}</p>
        </div>
      </div>
    </GlassCard>
  )
}
