import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play, Square, Video } from 'lucide-react'
import { useEntityStore } from '../../store/entities'
import { haApi } from '../../api/backend'
import { CameraStream } from '../widgets/CameraStream'
import { GlassCard } from '../glass/GlassCard'
import { CAMERA_STATUS_LABELS, type CameraPlaybackStatus } from '../../lib/cameraTransport'

/** Start explicitly: inspecting settings must not activate every camera. */
export function CameraDiagnostics({ active }: { active: boolean }) {
  const entities = useEntityStore((s) => s.entities)
  const cameras = Object.values(entities).filter((entity) => entity.entity_id.startsWith('camera.')).sort((a, b) => a.entity_id.localeCompare(b.entity_id))
  const [selected, setSelected] = useState('')
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<CameraPlaybackStatus>('paused')
  const capabilities = useQuery({ queryKey: ['camera-capabilities', selected], queryFn: () => haApi.cameraCapabilities(selected), enabled: active && Boolean(selected), retry: false, staleTime: 30_000 })
  const entity = entities[selected]
  const unavailable = !entity || ['unavailable', 'unknown'].includes(entity.state)
  const playing = active && running
  return (
    <GlassCard className="space-y-5">
      <div className="flex items-start gap-3"><Video size={22} className="mt-1 shrink-0 text-[var(--action-blue)]" /><div><h2 className="text-lg font-semibold text-[var(--ink)]">Verifica videocamere e Ring</h2><p className="mt-1 text-sm text-[var(--ink-secondary)]">Avvia una camera alla volta. La diretta è confermata quando arriva il primo frame; una foto resta indicata come immagine.</p></div></div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm font-medium text-[var(--ink-secondary)]" htmlFor="diagnostic-camera">Videocamera
          <select id="diagnostic-camera" value={selected} onChange={(event) => { setRunning(false); setStatus('paused'); setSelected(event.target.value) }} className="mt-2 min-h-11 w-full rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-solid)] px-3 text-[var(--ink)]">
            <option value="">Seleziona una videocamera</option>
            {cameras.map((camera) => <option key={camera.entity_id} value={camera.entity_id}>{String(camera.attributes.friendly_name ?? camera.entity_id)}{camera.state === 'unavailable' ? ' · non disponibile' : ''}</option>)}
          </select>
        </label>
        <button type="button" disabled={unavailable} onClick={() => { setRunning(!running); setStatus(running ? 'paused' : 'connecting') }} className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--action-blue)] px-5 text-sm font-semibold text-[var(--on-accent)] disabled:opacity-40">{running ? <Square size={16} /> : <Play size={16} />}{running ? 'Ferma video' : 'Prova diretta'}</button>
      </div>
      {cameras.length === 0 && <p className="text-sm text-[var(--ink-secondary)]">Nessuna videocamera ricevuta da Home Assistant. Controlla la connessione e l’integrazione Ring.</p>}
      {selected && <div className="space-y-2 text-sm text-[var(--ink-secondary)]">
        <p className="break-all text-xs text-[var(--ink-tertiary)]">{selected}</p>
        <p>Trasporti disponibili: {capabilities.isPending ? 'verifica in corso…' : capabilities.isError ? 'verifica non riuscita' : capabilities.data?.frontend_stream_types.join(' · ') || 'nessun trasporto HLS/WebRTC dichiarato'}</p>
        {capabilities.isError && <p role="alert">{capabilities.error.message} <button type="button" onClick={() => { void capabilities.refetch() }} className="min-h-11 font-semibold text-[var(--action-blue)]">Riprova verifica</button></p>}
        <p role="status" aria-live="polite" className="font-semibold text-[var(--ink)]">{CAMERA_STATUS_LABELS[playing ? status : 'paused']}</p>
      </div>}
      {playing && <div className="aspect-video max-h-[480px] overflow-hidden rounded-[16px]"><CameraStream key={selected} entityId={selected} fit="contain" badge preferLive onStatusChange={setStatus} /></div>}
      <div className="rounded-[14px] bg-[var(--fill-subtle)] p-4 text-sm leading-relaxed text-[var(--ink-secondary)]">Per Ring scegli l’entità della vista live. L’ultima registrazione e gli snapshot possono essere disponibili solo con un abbonamento e non confermano la diretta. Se la camera non risponde, verifica che la vista live funzioni nell’integrazione Home Assistant e nell’app Ring.</div>
    </GlassCard>
  )
}
