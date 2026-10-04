import { useEffect, useState, type ComponentType } from 'react'
import type { HassEntity } from 'home-assistant-js-websocket'

type DetailComponent = ComponentType<{ entity: HassEntity }>
const loaders: Record<string, () => Promise<{ default: DetailComponent }>> = {
  climate: () => import('./ClimateDetail').then(module => ({ default: module.ClimateDetail })),
  light: () => import('./LightDetail').then(module => ({ default: module.LightDetail })),
  alarm_control_panel: () => import('./AlarmDetail').then(module => ({ default: module.AlarmDetail })),
  media_player: () => import('./MediaDetail').then(module => ({ default: module.MediaDetail })),
}
const generic = () => import('./GenericDetail').then(module => ({ default: module.GenericDetail }))

/** Remounting on retry issues another import without recreating a component in render. */
export function DetailLoader({ domain, entity }: { domain: string; entity: HassEntity }) {
  const [result, setResult] = useState<{ Component?: DetailComponent; error?: Error } | null>(null)
  useEffect(() => {
    let cancelled = false
    void (loaders[domain] ?? generic)().then(
      module => { if (!cancelled) setResult({ Component: module.default }) },
      () => { if (!cancelled) setResult({ error: new Error('Pannello non disponibile') }) },
    )
    return () => { cancelled = true }
  }, [domain])
  if (result?.error) throw result.error
  const Detail = result?.Component
  if (!Detail) return <p role="status" className="py-8 text-center text-sm text-[var(--ink-secondary)]">Caricamento controlli…</p>
  return <Detail entity={entity} />
}
