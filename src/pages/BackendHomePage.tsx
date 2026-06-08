import { ActivitySquare, Boxes, DatabaseBackup, LayoutGrid, MonitorCog, RotateCcw, Settings2, ShieldCheck, TabletSmartphone, Zap } from 'lucide-react'
import { GlassCard } from '../components/glass/GlassCard'
import { WidgetHome } from '../components/home/widgets/WidgetHome'
import { WidgetCardPreview } from '../components/widgets/WidgetCardPreview'
import { useDashboardConfig, useUpdateConfig } from '../hooks/useDashboardConfig'
import { useRooms } from '../hooks/useRooms'
import { useEntityStore } from '../store/entities'
import { cn } from '../lib/utils'

const sections = [
  { label: 'Dashboard', detail: 'Widget, layout default e preview tablet', Icon: LayoutGrid },
  { label: 'Widget', detail: 'Creazione, dimensioni, entità associate', Icon: Boxes },
  { label: 'Tablet/Kiosk', detail: 'Reset layout, modalità ambiente, display', Icon: TabletSmartphone },
  { label: 'Integrazioni', detail: 'Home Assistant, meteo, news, calendario', Icon: MonitorCog },
  { label: 'Automazioni', detail: 'Scene, comandi rapidi e AI desktop', Icon: Zap },
  { label: 'Log e diagnostica', detail: 'Health check, offline, sync e backup', Icon: ActivitySquare },
  { label: 'Backup/Ripristino', detail: 'Export configurazione e versioni layout', Icon: DatabaseBackup },
  { label: 'Impostazioni', detail: 'Permessi, API e preferenze operative', Icon: Settings2 },
]

function MetricCard({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'ok' | 'warn' }) {
  return (
    <div className={cn(
      'rounded-[14px] border px-4 py-3',
      tone === 'ok' ? 'border-green-500/15 bg-green-500/10' : tone === 'warn' ? 'border-orange-500/15 bg-orange-500/10' : 'border-black/8 bg-black/[0.035]',
    )}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-black/35">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#1d1d1f]">{value}</p>
    </div>
  )
}

export function BackendHomePage() {
  const { data: config } = useDashboardConfig()
  const { data: rooms } = useRooms()
  const { mutate: update, isPending } = useUpdateConfig()
  const connectionStatus = useEntityStore((s) => s.connectionStatus)
  const entities = useEntityStore((s) => s.entities)
  const widgets = config?.home?.widgets ?? []
  const layoutVersion = config?.home?.layoutVersion ?? 1

  const resetTabletLayout = () => {
    if (!config?.home) return
    update({
      home: {
        ...config.home,
        positions: {},
        order: widgets.map((widget) => widget.id),
        // Send the read version; the backend bumps it and rejects stale writes.
        layoutVersion: layoutVersion,
        updatedAt: new Date().toISOString(),
        updatedBy: 'desktop',
      },
    })
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <GlassCard className="shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-black/8 text-black/60">
              <ShieldCheck size={21} />
            </div>
            <div>
              <p className="text-lg font-semibold text-[#1d1d1f]">Backend operativo MyHome</p>
              <p className="text-sm text-black/45">Centro gestione desktop per configurazione, diagnostica e layout kiosk.</p>
            </div>
          </div>
          <button
            onClick={resetTabletLayout}
            disabled={!config?.home || isPending}
            className="flex min-h-[44px] items-center gap-2 rounded-full bg-black/[0.07] px-4 text-sm font-semibold text-black/60 transition hover:bg-black/10 active:scale-95 disabled:opacity-45"
          >
            <RotateCcw size={16} /> Reset layout tablet
          </button>
        </div>
      </GlassCard>

      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="Connessione HA" value={connectionStatus === 'connected' ? 'Online' : connectionStatus === 'connecting' ? 'Sync' : 'Offline'} tone={connectionStatus === 'connected' ? 'ok' : 'warn'} />
        <MetricCard label="Widget dashboard" value={String(widgets.length)} />
        <MetricCard label="Stanze" value={String(rooms?.length ?? 0)} />
        <MetricCard label="Entità live" value={String(Object.keys(entities).length)} />
      </div>

      <div className="grid min-h-[520px] grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <GlassCard className="min-h-0 space-y-3 overflow-y-auto">
          <div>
            <p className="text-sm font-semibold text-[#1d1d1f]">Sezioni operative</p>
            <p className="mt-0.5 text-xs text-black/40">La configurazione tecnica vive qui, non sul tablet.</p>
          </div>
          <div className="space-y-2">
            {sections.map(({ label, detail, Icon }) => (
              <div key={label} className="flex items-center gap-3 rounded-[12px] bg-black/[0.04] px-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white text-black/55">
                  <Icon size={17} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#1d1d1f]">{label}</p>
                  <p className="truncate text-xs text-black/40">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="min-h-0 overflow-hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#1d1d1f]">Dashboard tablet</p>
              <p className="text-xs text-black/40">Versione layout {layoutVersion} · ultimo salvataggio {config?.home?.updatedAt ? new Date(config.home.updatedAt).toLocaleString('it-IT') : 'n/d'}</p>
            </div>
          </div>
          <div className="h-[calc(100%-48px)] min-h-0 overflow-hidden rounded-[14px] border border-black/8 bg-white/45 p-3">
            <WidgetHome />
          </div>
        </GlassCard>
      </div>

      <GlassCard className="shrink-0">
        <WidgetCardPreview />
      </GlassCard>
    </div>
  )
}
