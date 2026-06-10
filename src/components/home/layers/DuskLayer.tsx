import { useHAEntity } from '../../../hooks/useHAEntity'

/**
 * Dusk shift (DOMINICA M7, polish opzionale): velo caldo legato all'elevazione
 * solare (sun.sun). Max 6% di opacità in multiply — abbassa la temperatura
 * percepita del parchment al tramonto senza toccare i token. Solo `opacity`,
 * transizione lenta: costo GPU ≈ un layer composito statico.
 */
export function DuskLayer() {
  const sun = useHAEntity('sun.sun')
  const elevation = Number(sun?.attributes?.elevation)
  if (!Number.isFinite(elevation)) return null

  // elevazione 10° → 0; -6° (crepuscolo civile) → max. Notte fonda: resta max.
  const t = Math.min(1, Math.max(0, (10 - elevation) / 16))
  const opacity = t * 0.06
  if (opacity <= 0.001) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[5]"
      style={{
        background: '#ff9a3c',
        mixBlendMode: 'multiply',
        opacity,
        transition: 'opacity 2000ms linear',
      }}
    />
  )
}
