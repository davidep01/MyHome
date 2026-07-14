import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react'
import { framerSpring } from '../../../design/tokens'
import { roomGlyph } from '../../../lib/roomIcon'
import { useRoomsOverview, type RoomOverview } from '../../../hooks/useRoomsOverview'
import { ACTIVITY_META } from './roomActivity'
import { cn } from '../../../lib/utils'
import type { DeviceOverride } from '../../../api/backend'

export interface RoomTarget {
  title: string
  entityIds: string[]
}

/**
 * Strato 3 — Stanze: l'inventario completo dietro un tap. Ogni chip mostra il
 * glifo della stanza; quando la stanza "fa" qualcosa, il glifo lascia il posto
 * all'icona animata dell'attività dominante (musica, calore, luci…) con un
 * piccolo pop. "Spazi" apre il catalogo zoom-out.
 */
export function RoomsRow({
  hiddenEntities,
  overrides,
  onOpen,
  onZoomOut,
}: {
  hiddenEntities?: string[]
  overrides?: Record<string, DeviceOverride>
  onOpen: (room: RoomTarget) => void
  onZoomOut?: () => void
}) {
  const { rooms } = useRoomsOverview({ hiddenEntities, overrides })
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const updateEdges = useCallback(() => {
    const node = scrollerRef.current
    if (!node) return
    const next = {
      left: node.scrollLeft > 2,
      right: node.scrollLeft + node.clientWidth < node.scrollWidth - 2,
    }
    setEdges((current) => current.left === next.left && current.right === next.right ? current : next)
  }, [])

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    const frame = requestAnimationFrame(updateEdges)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateEdges)
    observer?.observe(node)
    window.addEventListener('resize', updateEdges)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', updateEdges)
    }
  }, [rooms, updateEdges])

  if (rooms.length === 0) return null

  return (
    <section className="shrink-0">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-black/35">Stanze</p>
        {onZoomOut && (
          <button
            type="button"
            onClick={onZoomOut}
            className="tap-target flex items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-[#0066cc] transition active:scale-95"
            aria-label="Apri la panoramica degli spazi"
          >
            <LayoutGrid size={14} />
            Spazi
          </button>
        )}
      </div>
      <div className="relative -mx-1">
        <div
          ref={scrollerRef}
          onScroll={updateEdges}
          className="flex snap-x snap-proximity scroll-px-1 gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Stanze della casa, scorri orizzontalmente per visualizzarle tutte"
        >
          {rooms.map((room) => (
            <RoomChip key={room.key} room={room} onOpen={onOpen} />
          ))}
        </div>
        {edges.left && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex w-8 items-center justify-start bg-gradient-to-r from-[#f5f5f7] via-[#f5f5f7]/80 to-transparent" aria-hidden="true">
            <ChevronLeft size={15} className="text-black/25" />
          </div>
        )}
        {edges.right && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-end bg-gradient-to-l from-[#f5f5f7] via-[#f5f5f7]/80 to-transparent" aria-hidden="true">
            <ChevronRight size={15} className="text-black/25" />
          </div>
        )}
      </div>
    </section>
  )
}

function RoomChip({ room, onOpen }: { room: RoomOverview; onOpen: (room: RoomTarget) => void }) {
  const meta = room.activity ? ACTIVITY_META[room.activity] : null
  // Icona risolta a runtime → createElement (stesso idioma di DynamicIcon).
  const icon = createElement(meta?.Icon ?? roomGlyph(room.title), { size: 18 })

  return (
    <button
      type="button"
      onClick={() => onOpen({ title: room.title, entityIds: room.entityIds })}
      className="flex min-h-[48px] max-w-[calc(100vw-48px)] shrink-0 snap-start items-center gap-2.5 rounded-full border border-black/8 bg-white/72 py-1.5 pl-2 pr-4 text-[15px] font-semibold text-[#1d1d1f] backdrop-blur-xl transition active:scale-95"
      aria-label={`${room.title}, ${room.active > 0 ? `${room.active} dispositivi attivi` : `${room.entityIds.length} dispositivi`}`}
    >
      <span
        className={cn('flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-300', meta && 'ai-active')}
        style={{
          background: meta ? meta.tone.bg : 'rgba(0,0,0,0.05)',
          color: meta ? meta.tone.color : 'rgba(29,29,31,0.55)',
        }}
        title={meta?.label}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={room.activity ?? 'glyph'}
            className="flex"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={framerSpring}
          >
            {icon}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="min-w-0 max-w-[min(44vw,220px)] truncate">{room.title}</span>
      <span className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        room.active > 0 ? 'bg-[#0066cc]/12 text-[#0066cc]' : 'bg-black/[0.06] text-black/40',
      )}
      >
        {room.active > 0 ? room.active : room.entityIds.length}
      </span>
    </button>
  )
}
