import { useEffect, useState, type ReactNode } from 'react'
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
  controls,
}: {
  entity?: HassEntity
  deviceTitle: string
  size: WidgetVisualSize
  progress?: MediaPlaybackProgress
  accentColor: string
  error?: string | null
  controls?: ReactNode
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
  const expanded = size === 'L'
  const mini = size === 'XS'

  return (
    <div className={cn(
      'ml-auto mt-auto flex w-[64%] min-w-0 flex-col text-right',
      (size === 'M' || size === 'XL') && 'media-card-compact-content',
      mini && 'w-[66%]',
      expanded && 'media-card-expanded-content w-[60%] h-full min-h-0 justify-start pt-12',
    )} data-media-live-content>
      <div className="mb-1 flex min-w-0 items-center justify-end gap-1.5">
        {expanded && app && <span className="max-w-[60%] truncate rounded-full bg-[var(--fill-subtle)] px-2 py-0.5 text-[13px] font-bold text-[var(--ink-secondary)] ">{app}</span>}
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-bold  text-[var(--ink-tertiary)]">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', playing ? 'media-live-dot' : 'bg-[var(--ink-tertiary)]')} style={playing ? { background: accentColor } : undefined} />
          <span className="truncate">{playback}</span>
        </span>
      </div>

      {!mini && <p className="mb-0.5 truncate text-[13px] font-semibold text-[var(--ink-tertiary)]">{deviceTitle}</p>}
      <p className={cn(
        'font-semibold leading-tight text-[var(--ink)] ',
        size === 'XS' ? 'line-clamp-1 text-[13px]' : size === 'S' ? 'line-clamp-1 text-[13px]' : size === 'M' || size === 'XL' ? 'line-clamp-1 text-[15px]' : 'line-clamp-2 text-[17px]',
      )}>{error ?? title}</p>
      {!mini && compactDetail && (
        <p className={cn(
          'mt-0.5 truncate text-[var(--ink-secondary)] ',
          size === 'S' ? 'text-[13px]' : 'text-[13px]',
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
          <div className="h-[3px] overflow-hidden rounded-full bg-[var(--fill-subtle)] ">
            <span
              className="block h-full w-full origin-left rounded-full transition-transform duration-1000 ease-linear"
              style={{ transform: `scaleX(${pct / 100})`, background: accentColor }}
            />
          </div>
          {expanded && (
            <div className="mt-1 flex justify-between text-[13px] font-semibold tabular-nums text-[var(--ink-tertiary)]">
              <span>{formatMediaTime(position)}</span>
              <span>{formatMediaTime(progress.duration)}</span>
            </div>
          )}
        </div>
      )}
      {controls}
    </div>
  )
}
