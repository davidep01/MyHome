import { createElement, useMemo } from 'react'
import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion'
import { X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { framerSpring } from '../../../design/tokens'
import { timeAgo } from '../../../lib/time'
import { roomGlyph } from '../../../lib/roomIcon'
import { cn } from '../../../lib/utils'
import { useEntityStore } from '../../../store/entities'
import { useUIStore } from '../../../store/ui'
import { useRoomsOverview, type RoomOverview } from '../../../hooks/useRoomsOverview'
import { ACTIVITY_META } from './roomActivity'
import { AnimEqualizer, AnimFan, AnimFlame, AnimLightbulb, AnimSnowflake, AnimSparkles } from '../../icons/animated'
import { widgetTones } from '../../widgets/utils/getRingColorScale'
import { entityName } from '../../widgets/utils/mapEntityToWidgetCard'
import type { RoomTarget } from './RoomsRow'
import type { DeviceOverride } from '../../../api/backend'

/**
 * Catalogo "Spazi" — lo zoom-out della casa: tutte le stanze come card da
 * rivista, icon-centriche, con i dati vivi e le icone animate dell'attività.
 * Si chiude con la X o trascinando giù dall'header (gesto elastico).
 * Il tap su una stanza apre l'EntitySheet sopra il catalogo (drill-down).
 */
export function SpacesCatalog({
  open,
  hiddenEntities,
  overrides,
  onClose,
  onOpenRoom,
}: {
  open: boolean
  hiddenEntities?: string[]
  overrides?: Record<string, DeviceOverride>
  onClose: () => void
  onOpenRoom: (room: RoomTarget) => void
}) {
  const { rooms } = useRoomsOverview({ hiddenEntities, overrides })
  const totalActive = rooms.reduce((n, r) => n + r.active, 0)

  // Drag-to-dismiss guidato dall'header: il pan muove tutto il pannello,
  // oltre soglia (o con un flick) chiude, altrimenti torna su di molla.
  const y = useMotionValue(0)
  const onPan = (_: unknown, info: { offset: { y: number } }) => {
    y.set(Math.max(0, info.offset.y))
  }
  const onPanEnd = (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
    if (info.offset.y > 120 || info.velocity.y > 800) onClose()
    else animate(y, 0, framerSpring)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col bg-[#f5f5f7]"
          style={{ y }}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98, y: 60 }}
          transition={framerSpring}
        >
          <motion.header
            onPan={onPan}
            onPanEnd={onPanEnd}
            className="shrink-0 cursor-grab touch-none px-7 pt-4"
            style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-black/12" aria-hidden="true" />
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-[44px] font-light leading-none tracking-tight text-[#1d1d1f]">Spazi</h1>
                <p className="mt-2 text-[15px] text-black/45">
                  {rooms.length} {rooms.length === 1 ? 'stanza' : 'stanze'}
                  {totalActive > 0 ? ` · ${totalActive} ${totalActive === 1 ? 'dispositivo attivo' : 'dispositivi attivi'}` : ' · tutto tranquillo'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/[0.07] text-black/60 transition active:scale-95"
                aria-label="Chiudi gli spazi"
              >
                <X size={18} />
              </button>
            </div>
          </motion.header>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pt-5"
            style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}
          >
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
              {rooms.map((room, index) => (
                <SpaceCard key={room.key} room={room} index={index} onOpen={onOpenRoom} />
              ))}
            </div>
            <AutomationsSection baseIndex={rooms.length} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Frasi di stato della stanza, in ordine di rilevanza (max 2). */
function roomFacts(room: RoomOverview): string[] {
  const facts: string[] = []
  if (room.mediaTitle) facts.push(room.mediaTitle)
  if (room.heating) facts.push('Riscaldamento attivo')
  if (room.cooling) facts.push('Raffrescamento attivo')
  if (room.lightsOn > 0) facts.push(room.lightsOn === 1 ? '1 luce accesa' : `${room.lightsOn} luci accese`)
  if (room.unlocked > 0) facts.push(room.unlocked === 1 ? 'Serratura aperta' : `${room.unlocked} serrature aperte`)
  if (room.coversOpen > 0) facts.push(room.coversOpen === 1 ? '1 apertura su' : `${room.coversOpen} aperture su`)
  if (room.vacuumBusy) facts.push('Pulizia in corso')
  if (facts.length === 0) facts.push('Tutto spento')
  return facts.slice(0, 2)
}

function SpaceCard({ room, index, onOpen }: { room: RoomOverview; index: number; onOpen: (room: RoomTarget) => void }) {
  const meta = room.activity ? ACTIVITY_META[room.activity] : null
  // Icona risolta a runtime → createElement (stesso idioma di DynamicIcon).
  const icon = createElement(meta?.Icon ?? roomGlyph(room.title), { size: 26 })
  const quiet = room.active === 0

  // Strip delle attività in corso (oltre la dominante), icone animate piccole.
  const strip: { key: string; Icon: typeof AnimLightbulb; tone: typeof widgetTones.light }[] = []
  if (room.lightsOn > 0) strip.push({ key: 'light', Icon: AnimLightbulb, tone: widgetTones.light })
  if (room.mediaTitle) strip.push({ key: 'media', Icon: AnimEqualizer, tone: widgetTones.media })
  if (room.heating) strip.push({ key: 'heat', Icon: AnimFlame, tone: widgetTones.heat })
  if (room.cooling) strip.push({ key: 'cool', Icon: AnimSnowflake, tone: widgetTones.cool })
  if (room.fansOn > 0) strip.push({ key: 'fan', Icon: AnimFan, tone: widgetTones.cool })

  return (
    <button
      type="button"
      onClick={() => onOpen({ title: room.title, entityIds: room.entityIds })}
      className="card-enter glass glass-border flex min-h-[164px] flex-col rounded-[22px] p-5 text-left transition active:scale-[0.98]"
      style={{ '--enter-i': Math.min(index, 10) } as CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn('flex h-14 w-14 items-center justify-center rounded-full transition-colors duration-300', meta && 'ai-active')}
          style={{
            background: meta ? meta.tone.bg : 'rgba(0,0,0,0.05)',
            color: meta ? meta.tone.color : 'rgba(29,29,31,0.5)',
          }}
        >
          {icon}
        </span>
        {room.temperature !== null && (
          <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-[13px] font-semibold tabular-nums text-black/55">
            {room.temperature.toFixed(1)}°
          </span>
        )}
      </div>

      <div className="mt-auto min-w-0 pt-4">
        <p className="truncate text-[19px] font-semibold leading-tight text-[#1d1d1f]">{room.title}</p>
        <p className={cn('mt-1 truncate text-[13px] font-semibold', quiet ? 'text-black/35' : 'text-black/50')}>
          {roomFacts(room).join(' · ')}
        </p>
      </div>

      {strip.length > 1 && (
        <div className="mt-3 flex items-center gap-1.5">
          {strip.map(({ key, Icon: StripIcon, tone }) => (
            <span
              key={key}
              className="ai-active flex h-7 w-7 items-center justify-center rounded-full"
              style={{ background: tone.bg, color: tone.color }}
            >
              <StripIcon size={14} />
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

/** Scattata nell'ultima ora? (stesso pattern impuro-fuori-render di timeAgo) */
function isRecent(iso: string | null): boolean {
  return Boolean(iso) && Date.now() - new Date(iso as string).getTime() < 60 * 60 * 1000
}

/** Automazioni abilitate, le più recenti prima; brillano se scattate da poco. */
function AutomationsSection({ baseIndex }: { baseIndex: number }) {
  const entities = useEntityStore((s) => s.entities)
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)

  const automations = useMemo(() => {
    const list = Object.values(entities)
      .filter((e) => e.entity_id.startsWith('automation.') && e.state === 'on')
      .map((e) => {
        const last = (e.attributes?.last_triggered as string | undefined) ?? null
        return {
          id: e.entity_id,
          name: entityName(e),
          last,
          recent: isRecent(last),
        }
      })
      .sort((a, b) => (b.last ?? '').localeCompare(a.last ?? ''))
    return list.slice(0, 12)
  }, [entities])

  if (automations.length === 0) return null

  return (
    <section className="mt-8">
      <p className="mb-3 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-black/35">Automazioni attive</p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {automations.map((a, i) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setSelectedEntity(a.id)}
            className="card-enter glass glass-border flex min-h-[56px] items-center gap-3 rounded-[18px] px-4 py-3 text-left transition active:scale-[0.98]"
            style={{ '--enter-i': Math.min(baseIndex + i, 14) } as CSSProperties}
          >
            <span
              className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', a.recent && 'ai-active')}
              style={{ background: widgetTones.media.bg, color: widgetTones.media.color }}
            >
              <AnimSparkles size={16} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[#1d1d1f]">{a.name}</span>
              <span className="block truncate text-xs font-semibold text-black/40">
                {a.last ? `Ultima esecuzione ${timeAgo(a.last)}` : 'Mai eseguita'}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
