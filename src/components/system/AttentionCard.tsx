import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useCriticalAlerts } from '../../hooks/useCriticalAlerts'
import { useNotifications } from '../../hooks/useNotifications'
import { useAttentionSnoozes } from '../../hooks/useAttentionSnoozes'
import { buildAttentionItems, type AttentionItem, type SystemProblem } from '../../lib/attention'
import { isSnoozed } from '../../lib/attentionSnooze'
import type { OfflineReport } from '../../lib/offlineDevices'
import { cn } from '../../lib/utils'

const SNOOZE_OPTIONS: { label: string; minutes: number }[] = [
  { label: '1 ora', minutes: 60 },
  { label: 'Stasera', minutes: 240 },
  { label: 'Domani', minutes: 24 * 60 },
]

/**
 * "Cosa non va", unificato: compone allarmi critici (sempre visibili),
 * dispositivi offline, batterie basse e problemi di configurazione in un'unica
 * lista ordinata per severità, con posticipo per tutto ciò che non è
 * sicurezza/intrusione.
 */
export function AttentionCard({
  problems, offline, loading, onNavigateSystem,
}: {
  problems: SystemProblem[]
  offline: OfflineReport
  loading: boolean
  onNavigateSystem: () => void
}) {
  const criticalAlerts = useCriticalAlerts()
  const notifications = useNotifications()
  const batteryNotifications = useMemo(() => notifications.filter((n) => n.type === 'battery'), [notifications])

  const items = useMemo(() => buildAttentionItems({
    criticalAlerts, offline, batteryNotifications, systemProblems: problems,
  }), [criticalAlerts, offline, batteryNotifications, problems])

  const { snoozes, snoozeFor, ignoreUntilChanged, clear } = useAttentionSnoozes(items)
  const [showSuppressed, setShowSuppressed] = useState(false)
  // Aggiornato a intervalli, mai letto direttamente durante il render: un
  // posticipo "1 ora" deve tornare visibile da solo, senza un remount.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const activeItems = items.filter((item) => !isSnoozed(item, snoozes, now))
  const suppressedCount = items.length - activeItems.length
  const visible = showSuppressed ? items : activeItems

  return (
    <GlassCard className="space-y-2 overflow-y-auto">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold text-[#1d1d1f]">Cosa non va</h2>
        {suppressedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowSuppressed((s) => !s)}
            className="tap-target rounded-full px-2 text-[11px] font-semibold text-black/40 active:scale-95"
          >
            {showSuppressed ? 'Nascondi posticipati' : `${suppressedCount} posticipat${suppressedCount === 1 ? 'o' : 'i'}`}
          </button>
        )}
      </div>
      {loading ? (
        <div className="flex min-h-[132px] flex-col items-center justify-center gap-2 text-black/40" role="status">
          <p className="text-sm">Controllo dei servizi in corso…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex min-h-[132px] flex-col items-center justify-center gap-2 text-black/35">
          <CheckCircle2 size={28} className="text-green-600/70" />
          <p className="text-sm">Tutto regolare.</p>
        </div>
      ) : (
        visible.map((item) => (
          <AttentionRow
            key={item.id}
            item={item}
            snoozedNow={isSnoozed(item, snoozes, now)}
            onAction={item.actionTarget === 'system' ? onNavigateSystem : undefined}
            onSnooze={(minutes) => snoozeFor(item.id, minutes)}
            onIgnore={() => ignoreUntilChanged(item)}
            onRestore={() => clear(item.id)}
          />
        ))
      )}
    </GlassCard>
  )
}

function AttentionRow({
  item, snoozedNow, onAction, onSnooze, onIgnore, onRestore,
}: {
  item: AttentionItem
  snoozedNow: boolean
  onAction?: () => void
  onSnooze: (minutes: number) => void
  onIgnore: () => void
  onRestore: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const tint = item.severity === 'critical' ? 'bg-red-500/10' : item.severity === 'warning' ? 'bg-orange-500/10' : 'bg-black/[0.04]'
  const iconColor = item.severity === 'critical' ? 'text-red-600' : item.severity === 'warning' ? 'text-orange-600' : 'text-black/40'
  const Icon = item.severity === 'critical' ? ShieldAlert : AlertTriangle

  return (
    <div className={cn('rounded-[12px] px-3 py-2.5', tint, snoozedNow && 'opacity-50')}>
      <div className="flex items-center gap-3">
        <Icon size={16} className={cn('shrink-0', iconColor)} />
        <p className="min-w-0 flex-1 text-sm text-[#1d1d1f]">{item.text}</p>
        {snoozedNow ? (
          <button type="button" onClick={onRestore} className="tap-target min-h-9 shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black/60 active:scale-95">
            Riattiva
          </button>
        ) : onAction ? (
          <button type="button" onClick={onAction} className="min-h-[44px] shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black/60 active:scale-95">
            Sistema
          </button>
        ) : item.suppressible ? (
          <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} className="tap-target min-h-9 shrink-0 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-black/50 active:scale-95">
            Posticipa
          </button>
        ) : null}
      </div>
      {menuOpen && item.suppressible && !snoozedNow && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
          {SNOOZE_OPTIONS.map((option) => (
            <button
              key={option.minutes}
              type="button"
              onClick={() => { onSnooze(option.minutes); setMenuOpen(false) }}
              className="tap-target min-h-8 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-black/55 active:scale-95"
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { onIgnore(); setMenuOpen(false) }}
            className="tap-target min-h-8 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-black/55 active:scale-95"
          >
            Finché non cambia
          </button>
        </div>
      )}
    </div>
  )
}
