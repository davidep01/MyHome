import { useState } from 'react'
import { AlertTriangle, CheckCircle2, PlugZap } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { timeAgo } from '../../lib/time'
import { cn } from '../../lib/utils'
import type { OfflineReport } from '../../lib/offlineDevices'

/**
 * Guasti veri, raggruppati per integrazione. Il rumore (tracker BLE,
 * telemetria) resta un numero in fondo: contato, mai in evidenza.
 */
export function OfflineDevicesCard({ report, ready }: { report: OfflineReport; ready: boolean }) {
  // Aperti di default: la domanda è "quali dispositivi sono giù", e una
  // risposta che richiede un click non è una risposta. Si richiude a mano
  // quando un'integrazione ne ha molti e si vuole scorrere le altre.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  return (
    <GlassCard className="space-y-2">
      <div className="flex items-center gap-2">
        <PlugZap size={16} className="text-black/45" />
        <h2 className="flex-1 text-sm font-semibold text-[#1d1d1f]">Dispositivi offline</h2>
        {report.deviceCount > 0 && (
          <span className="rounded-full bg-orange-500/12 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
            {report.deviceCount}
          </span>
        )}
      </div>

      {!ready ? (
        <p className="py-6 text-center text-sm text-black/40" role="status">In attesa della connessione…</p>
      ) : report.deviceCount === 0 ? (
        <div className="flex min-h-[96px] flex-col items-center justify-center gap-2 text-black/35">
          <CheckCircle2 size={26} className="text-green-600/70" />
          <p className="text-sm">Tutti i dispositivi rispondono.</p>
        </div>
      ) : (
        report.integrations.map((group) => {
          const open = !collapsed.has(group.platform)
          return (
            <div key={group.platform} className="overflow-hidden rounded-[12px] bg-black/[0.04]">
              <button
                type="button"
                onClick={() => setCollapsed((current) => {
                  const next = new Set(current)
                  if (next.has(group.platform)) next.delete(group.platform)
                  else next.add(group.platform)
                  return next
                })}
                className="flex min-h-[44px] w-full items-center gap-2.5 px-3 py-2 text-left"
                aria-expanded={open}
              >
                <AlertTriangle size={15} className="shrink-0 text-orange-600" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1d1d1f]">{group.platform}</span>
                <span className="shrink-0 text-xs text-black/45">
                  {group.entries.length === 1 ? '1 dispositivo' : `${group.entries.length} dispositivi`}
                </span>
              </button>
              {open && (
                <div className="space-y-1 px-2 pb-2">
                  {group.entries.map((entry) => (
                    <div key={entry.entityId} className="flex items-center gap-3 rounded-[10px] bg-black/[0.02] px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[#1d1d1f]">{entry.name}</p>
                        <p className="truncate text-[11px] text-black/40">{entry.areaName ?? 'Nessuna stanza'}</p>
                      </div>
                      <p className="shrink-0 text-[11px] text-black/40">{timeAgo(entry.since)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}

      {ready && report.backgroundCount > 0 && (
        <p className={cn('pt-1 text-[11px] leading-relaxed text-black/35')}>
          Altre {report.backgroundCount} entità di sfondo non rispondono (tracker, telemetria, sensori di
          servizio). Non indicano un guasto e restano fuori da avvisi e dashboard.
        </p>
      )}
    </GlassCard>
  )
}
