import { useEffect, useMemo } from 'react'
import { Minimize2 } from 'lucide-react'
import type { DoorbellDevice } from '../../api/backend'
import { cameraDoorbellShortcuts } from '../../lib/doorbell'
import { visibleShortcuts } from '../../lib/actionShortcuts'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useUIStore } from '../../store/ui'
import { markKioskActivity } from '../../lib/kioskActivity'
import { entityName } from '../widgets/utils/mapEntityToWidgetCard'
import { CameraStream } from '../widgets/CameraStream'
import { ShortcutActionButton } from '../controls/ShortcutActionButton'

export function FullscreenCameraOverlay({
  entityId,
  doorbells,
}: {
  entityId: string
  doorbells?: DoorbellDevice[]
}) {
  const entity = useHAEntity(entityId)
  const setFullscreenCamera = useUIStore((s) => s.setFullscreenCamera)
  const shortcuts = useMemo(
    () => visibleShortcuts(cameraDoorbellShortcuts(doorbells, entityId)),
    [doorbells, entityId],
  )

  useEffect(() => {
    markKioskActivity()
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreenCamera(null)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [setFullscreenCamera])

  return (
    <section
      className="fixed inset-0 z-[85] overflow-hidden bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`Video a schermo intero: ${entityName(entity)}`}
    >
      <CameraStream entityId={entityId} fit="contain" muted preferLive badge priority />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/75 to-transparent px-5 pb-12 pt-[max(20px,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-white">{entityName(entity)}</p>
          <p className="text-sm text-white/60">Video in diretta</p>
        </div>
        <button
          type="button"
          onClick={() => setFullscreenCamera(null)}
          className="pointer-events-auto flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-semibold text-white backdrop-blur transition active:scale-95"
          aria-label="Esci dallo schermo intero"
        >
          <Minimize2 size={17} aria-hidden="true" /> Esci
        </button>
      </div>
      {shortcuts.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-black/80 to-transparent px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-16">
          <div className="flex w-full max-w-xl flex-wrap gap-3" aria-label="Azioni videocamera">
            {shortcuts.map((shortcut) => (
              <ShortcutActionButton key={shortcut.id} shortcut={shortcut} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
