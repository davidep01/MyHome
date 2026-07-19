import { useEffect, useState } from 'react'
import type { HassEntity } from 'home-assistant-js-websocket'
import { cn } from '../../lib/utils'
import type { WidgetVisualSize } from './types'
import { formatMediaTime, mediaPositionAt, type MediaPlaybackProgress } from './utils/mediaProgress'

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Metadati media live, graduati per densità ma presenti in ogni footprint. */
export function MediaCardContent({
  entity,
  deviceTitle,
  size,
  progress,
  accentColor,
  error,
}: {
  entity?: HassEntity
  deviceTitle: string
  size: WidgetVisualSize
  progress?: MediaPlaybackProgress
  accentColor: string
  error?: string | null
}) {
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!progress?.playing) return
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [progress?.playing])

  const attrs = entity?.attributes ?? {}
  const title = text(attrs.media_title) ?? (entity?.state === 'off' ? 'Spento' : 'Nessuna riproduzione')
  const artist = text(attrs.media_artist) ?? text(attrs.media_series_title)
  const album = text(attrs.media_album_name)
  const app = text(attrs.app_name) ?? text(attrs.source)
  const playing = entity?.state === 'playing'
  const paused = entity?.state === 'paused'
  const playback = playing ? 'In riproduzione' : paused ? 'In pausa' : entity?.state === 'off' ? 'Spento' : 'Pronto'
  const creator = [artist, album && album !== artist ? album : undefined].filter(Boolean).join(' · ')
  const compactDetail = creator || app || playback
  const position = progress ? mediaPositionAt(progress, clock) : 0
  const pct = progress && progress.duration > 0 ? Math.max(0, Math.min(100, (position / progress.duration) * 100)) : 0
  const expanded = size === 'L' || size === 'XL'
  const mini = size === 'XS'

  return (
    <div className={cn(
      'ml-auto mt-auto flex w-[64%] min-w-0 flex-col text-right',
      mini && 'w-[66%]',
      expanded && 'w-[60%]',
    )} aria-live="polite" data-media-live-content>
      <div className="mb-1 flex min-w-0 items-center justify-end gap-1.5">
        {!mini && app && <span className="max-w-[60%] truncate rounded-full bg-black/[0.06] px-2 py-0.5 text-[9px] font-bold text-black/45 dark:bg-white/[0.09] dark:text-white/48">{app}</span>}
        <span className="flex shrink-0 items-center gap-1 text-[9px] font-bold uppercase tracking-[0.06em] text-black/38 dark:text-white/42">
          <span className={cn('h-1.5 w-1.5 rounded-full', playing ? 'media-live-dot' : 'bg-black/25 dark:bg-white/28')} style={playing ? { background: accentColor } : undefined} />
          {playback}
        </span>
      </div>

      {expanded && <p className="mb-0.5 truncate text-[10px] font-semibold text-black/38 dark:text-white/42">{deviceTitle}</p>}
      <p className={cn(
        'font-semibold leading-tight text-[#1d1d1f] dark:text-white',
        size === 'XS' ? 'line-clamp-1 text-[11px]' : size === 'S' ? 'line-clamp-1 text-[13px]' : size === 'M' ? 'line-clamp-1 text-[15px]' : 'line-clamp-2 text-[17px]',
      )}>{error ?? title}</p>
      {!mini && compactDetail && (
        <p className={cn(
          'mt-0.5 truncate text-black/48 dark:text-white/52',
          size === 'S' ? 'text-[10px]' : 'text-[12px]',
        )}>{compactDetail}</p>
      )}

      {!mini && progress && progress.duration > 0 && (
        <div
          className="mt-1.5"
          role="progressbar"
          aria-label={`Avanzamento ${Math.round(pct)}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div className="h-[3px] overflow-hidden rounded-full bg-black/10 dark:bg-white/12">
            <span
              className="block h-full w-full origin-left rounded-full transition-transform duration-1000 ease-linear"
              style={{ transform: `scaleX(${pct / 100})`, background: accentColor }}
            />
          </div>
          {size !== 'S' && (
            <div className="mt-1 flex justify-between text-[9px] font-semibold tabular-nums text-black/35 dark:text-white/38">
              <span>{formatMediaTime(position)}</span>
              <span>{formatMediaTime(progress.duration)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
