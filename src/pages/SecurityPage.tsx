import { ShieldCheck } from 'lucide-react'
import { GlassCard } from '../components/glass/GlassCard'
import { SectionBand } from '../components/home/SectionBand'
import { WidgetGrid } from '../components/widgets/WidgetGrid'
import { useHomeStatus } from '../hooks/useHomeStatus'
import { useDiscoveredEntities } from '../hooks/useDiscoveredEntities'

export function SecurityPage() {
  const status = useHomeStatus()
  const { sections } = useDiscoveredEntities()
  const cameras = sections.find((s) => s.domain === 'camera')?.entities ?? []
  const locks = sections.find((s) => s.domain === 'lock')?.entities ?? []
  const alarms = sections.find((s) => s.domain === 'alarm_control_panel')?.entities ?? []
  const access = [...locks, ...alarms]
  const Icon = status.Icon ?? ShieldCheck

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto pr-1">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-[#1d1d1f] sm:text-3xl">Sicurezza</h1>
        <p className="mt-1 text-sm text-black/45">Accessi, allarme e videocamere</p>
      </div>

      <GlassCard glow={status.tone === 'ok' ? undefined : `${status.color}55`} className="min-h-[120px]">
        <div className="flex h-full items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-black/8">
            <Icon size={25} style={{ color: status.color }} />
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-[-0.012em] text-[#1d1d1f]">{status.label}</p>
            <p className="mt-1 text-sm text-black/40">{status.detail}</p>
          </div>
        </div>
      </GlassCard>

      {access.length > 0 && (
        <SectionBand title="Accessi" count={access.length}>
          <WidgetGrid entities={access} />
        </SectionBand>
      )}
      <SectionBand title="Videocamere" count={cameras.length}>
        {cameras.length === 0
          ? <p className="col-span-full py-8 text-center text-sm text-black/40">Nessuna videocamera esposta da HA</p>
          : <WidgetGrid entities={cameras} />}
      </SectionBand>
    </div>
  )
}
