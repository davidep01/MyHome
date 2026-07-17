/* eslint-disable react-hooks/set-state-in-effect --
   `mode` reflects the streaming negotiation lifecycle; transitioning it inside the
   connection effect (and on capability/error/timeout) is the intended behaviour. */
import { useEffect, useRef, useState } from 'react'
import type Hls from 'hls.js'
import { Video } from 'lucide-react'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useActiveWhenVisible } from '../../hooks/useActiveWhenVisible'
import { haApi } from '../../api/backend'
import { getCameraStreamUrl, getCameraProxyUrl, toProxiedHlsUrl } from '../../api/ha-rest'
import { cn } from '../../lib/utils'
import { entityName } from './utils/mapEntityToWidgetCard'

interface CameraStreamProps {
  entityId: string
  fit?: 'cover' | 'contain'
  className?: string
  muted?: boolean
  /**
   * Latenza minima per rispondere alla porta: MJPEG e HLS partono IN PARALLELO
   * e vince il primo che consegna un frame (le Ring non emettono mai MJPEG,
   * l'HLS cloud impiega 5–10s: in serie era nero troppo a lungo). Usato dal
   * campanello.
   */
  preferLive?: boolean
  /** Pill di stato (LIVE / FOTO) nell'angolo — per le card. */
  badge?: boolean
}

/**
 * Vista camera format-agnostica. Il browser non ha socket né token HA: l'URL
 * HLS è firmato dal backend (`/api/ha/camera-hls-url`) e ogni flusso passa dal
 * proxy same-origin. Catena:
 *   0. Snapshot immediato come placeholder: si vede SUBITO qualcosa.
 *   1. HLS   — `camera/stream` firmato + hls.js (in gara col MJPEG se preferLive).
 *   2. MJPEG — /camera_proxy_stream (il proxy non tronca più il flusso).
 *   3. Snapshot aggiornato ogni 2s quando nessun live è possibile.
 * (WebRTC/talk-back torneranno con un signaling proxy backend — docs/DOMINICA.md.)
 */
type Mode = 'connecting' | 'hls' | 'mjpeg' | 'snapshot' | 'error' | 'paused'

/** hls.js su camere cloud (Ring): la playlist può arrivare dopo parecchi secondi. */
const HLS_CONFIG = {
  enableWorker: true,
  backBufferLength: 30,
  manifestLoadingTimeOut: 15_000,
  manifestLoadingMaxRetry: 1,
  levelLoadingTimeOut: 15_000,
  fragLoadingTimeOut: 15_000,
  lowLatencyMode: true,
}

const LIVE_NEGOTIATION_MS = 20_000
const LIVE_RETRY_MS = 12_000
const STALL_RETRY_MS = 10_000

export function CameraStream({ entityId, fit = 'cover', className, muted = true, preferLive = false, badge = false }: CameraStreamProps) {
  const entity = useHAEntity(entityId)
  const videoRef = useRef<HTMLVideoElement>(null)
  const { ref: containerRef, active } = useActiveWhenVisible<HTMLDivElement>()
  const [mode, setMode] = useState<Mode>('connecting')
  const [snap, setSnap] = useState('')
  const [placeholder, setPlaceholder] = useState('')
  const [mjpegLive, setMjpegLive] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const unavailable = !entity || entity.state === 'unavailable'
  const cameraLabel = entityName(entity)
  const mjpegLoadedRef = useRef(false)
  /** Primo frame MJPEG arrivato (in gara: il MJPEG vince e l'HLS si spegne). */
  const mjpegWinRef = useRef<() => void>(() => {})
  /** MJPEG in errore senza frame (catena classica: si passa allo snapshot). */
  const mjpegFailRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (unavailable) { setMode('error'); return }
    // Fuori dallo schermo o display spento → nessun flusso attivo.
    if (!active) { setMode('paused'); return }

    let cancelled = false
    let hls: Hls | null = null
    let watchdog: ReturnType<typeof setTimeout> | null = null
    let stallTimer: ReturnType<typeof setTimeout> | null = null
    let mediaRecoveries = 0
    let settled = false
    const streamVideo = videoRef.current
    setMode('connecting')
    setMjpegLive(false)
    mjpegLoadedRef.current = false

    // 0 — placeholder istantaneo: l'ultima immagine disponibile, mai schermo nero.
    setPlaceholder(`${getCameraProxyUrl(entityId)}?_t=${Date.now()}`)

    const clearStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = null
    }
    const goSnapshot = () => { if (!cancelled && !settled) { settled = true; setMode('snapshot') } }
    const reconnect = () => {
      if (cancelled) return
      settled = true
      clearStallTimer()
      if (watchdog) clearTimeout(watchdog)
      setMode('connecting')
      setRetryKey((key) => key + 1)
    }

    const watchPlayback = (video: HTMLVideoElement) => {
      const onHealthy = () => clearStallTimer()
      const onWaiting = () => {
        clearStallTimer()
        stallTimer = setTimeout(reconnect, STALL_RETRY_MS)
      }
      video.addEventListener('playing', onHealthy)
      video.addEventListener('timeupdate', onHealthy)
      video.addEventListener('waiting', onWaiting)
      video.addEventListener('stalled', onWaiting)
      video.addEventListener('ended', reconnect)
      return () => {
        video.removeEventListener('playing', onHealthy)
        video.removeEventListener('timeupdate', onHealthy)
        video.removeEventListener('waiting', onWaiting)
        video.removeEventListener('stalled', onWaiting)
        video.removeEventListener('ended', reconnect)
      }
    }
    let stopWatchingPlayback: (() => void) | null = null

    const startHls = async (onFail: () => void) => {
      const video = streamVideo
      if (!video) return onFail()
      try {
        // hls.js è pesante (~250KB): caricato solo quando serve davvero.
        const { default: Hls } = await import('hls.js/light')
        const resp = await haApi.cameraHlsUrl(entityId)
        if (cancelled || settled) return
        const src = toProxiedHlsUrl(resp.url)
        if (Hls.isSupported()) {
          hls?.destroy()
          hls = new Hls(HLS_CONFIG)
          hls.loadSource(src); hls.attachMedia(video)
          hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}) })
          // Un manifest valido non garantisce che Ring stia consegnando video:
          // dichiariamo vittoria soltanto al primo frammento realmente bufferizzato.
          hls.on(Hls.Events.FRAG_BUFFERED, () => {
            if (cancelled || settled) return
            settled = true
            if (watchdog) clearTimeout(watchdog)
            setMode('hls')
            stopWatchingPlayback = watchPlayback(video)
            video.play().catch(() => {})
          })
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal || cancelled) return
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 1) {
              mediaRecoveries += 1
              try { hls?.recoverMediaError(); return } catch { /* fall through */ }
            }
            if (settled) reconnect()
            else {
              hls?.destroy()
              hls = null
              onFail()
            }
          })
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src
          video.addEventListener('loadeddata', () => {
            if (cancelled || settled) return
            settled = true
            if (watchdog) clearTimeout(watchdog)
            setMode('hls')
            stopWatchingPlayback = watchPlayback(video)
            video.play().catch(() => {})
          }, { once: true })
          video.addEventListener('error', () => { if (settled) reconnect(); else onFail() }, { once: true })
        } else onFail()
      } catch {
        if (!settled) onFail() // HLS non supportato da questa camera → fallback
      }
    }

    if (preferLive) {
      // ── Gara MJPEG ‖ HLS: vince il primo frame ──────────────────────────────
      setMode('mjpeg')
      mjpegLoadedRef.current = false
      mjpegWinRef.current = () => {
        if (cancelled || settled) return
        settled = true
        if (watchdog) clearTimeout(watchdog)
        hls?.destroy()
        hls = null
      }
      // Un errore MJPEG in gara non decide nulla: l'HLS sta già correndo.
      mjpegFailRef.current = () => {}
      // Un fallimento HLS non deve troncare il MJPEG ancora in gara.
      void startHls(() => {})
      // Le Ring cloud possono impiegare diversi secondi a produrre il primo
      // segmento: il timeout copre l'intera negoziazione, non solo il manifest.
      watchdog = setTimeout(() => { if (!mjpegLoadedRef.current) goSnapshot() }, LIVE_NEGOTIATION_MS)
    } else {
      // ── Catena classica: HLS → MJPEG → snapshot ────────────────────────────
      void startHls(() => {
        if (cancelled) return
        mjpegLoadedRef.current = false
        setMode('mjpeg')
        mjpegWinRef.current = () => { if (watchdog) clearTimeout(watchdog) }
        mjpegFailRef.current = goSnapshot
        if (watchdog) clearTimeout(watchdog)
        watchdog = setTimeout(() => {
          if (!cancelled && !mjpegLoadedRef.current) goSnapshot()
        }, 6_000)
      })
    }

    return () => {
      cancelled = true
      settled = true
      if (watchdog) clearTimeout(watchdog)
      clearStallTimer()
      stopWatchingPlayback?.()
      hls?.destroy()
      if (streamVideo) {
        streamVideo.pause()
        streamVideo.removeAttribute('src')
        streamVideo.load()
      }
    }
  }, [entityId, preferLive, unavailable, active, retryKey])

  // ── Snapshot polling — solo quando nessun flusso live è disponibile ──
  useEffect(() => {
    if (mode !== 'snapshot') return
    const tick = () => setSnap(`${getCameraProxyUrl(entityId)}?_t=${Date.now()}`)
    tick()
    const id = setInterval(tick, 2000)
    // Snapshot is a resilient fallback, not a terminal state: periodically ask
    // HA for a fresh signed stream so Ring recovers without closing the panel.
    const retry = setTimeout(() => setRetryKey((key) => key + 1), LIVE_RETRY_MS)
    return () => { clearInterval(id); clearTimeout(retry) }
  }, [mode, entityId])

  const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover'
  const liveVisible = mode === 'hls' || (mode === 'mjpeg' && mjpegLive)
  const showPlaceholder = Boolean(placeholder) && !liveVisible && mode !== 'snapshot' && mode !== 'error'
  const backdrop = fit === 'contain' ? (snap || placeholder) : ''

  return (
    <div ref={containerRef} className={cn('relative h-full w-full overflow-hidden bg-[#15171c]', className)}>
      {/* Le camere Ring sono spesso più strette del tablet. In modalità contain
          l'intera inquadratura resta visibile e le bande vengono riempite da
          una copia sfocata dello snapshot, senza ritagliare persone o pacchi. */}
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          aria-hidden="true"
          className="absolute inset-[-8%] h-[116%] w-[116%] scale-110 object-cover opacity-50 blur-2xl"
          onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )}

      {/* Placeholder: l'ultima foto nota, leggermente attenuata finché il live non arriva. */}
      {showPlaceholder && (
        <img
          src={placeholder}
          alt=""
          aria-hidden="true"
          className={cn('absolute inset-0 h-full w-full opacity-80', fitClass)}
          onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        aria-label={`Video in diretta: ${cameraLabel}`}
        className={cn('absolute inset-0 h-full w-full transition-opacity duration-500', fitClass, mode === 'hls' ? 'opacity-100' : 'opacity-0 pointer-events-none')}
      />

      {mode === 'mjpeg' && (
        <img
          src={getCameraStreamUrl(entityId)}
          alt={`Video in diretta: ${cameraLabel}`}
          className={cn('absolute inset-0 h-full w-full transition-opacity duration-300', fitClass, mjpegLive ? 'opacity-100' : 'opacity-0')}
          onLoad={() => { mjpegLoadedRef.current = true; setMjpegLive(true); mjpegWinRef.current() }}
          onError={() => { if (!mjpegLoadedRef.current) mjpegFailRef.current() }}
        />
      )}

      {mode === 'snapshot' && snap && (
        <img src={snap} alt={`Immagine videocamera: ${cameraLabel}`} className={cn('absolute inset-0 h-full w-full', fitClass)} />
      )}

      {mode === 'connecting' && !showPlaceholder && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
        </div>
      )}
      {showPlaceholder && (
        <div className="absolute bottom-2 right-2 h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white/80" aria-hidden="true" />
      )}

      {badge && liveVisible && (
        <span className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white backdrop-blur-sm">
          <span className="camera-live-dot h-1.5 w-1.5 rounded-full bg-[#ff453a]" aria-hidden="true" />
          Live
        </span>
      )}
      {badge && mode === 'snapshot' && (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white/80 backdrop-blur-sm">
          Foto
        </span>
      )}

      {(mode === 'error' || unavailable) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/45">
          <Video size={32} strokeWidth={1.5} />
          <span className="text-xs">Flusso non disponibile</span>
        </div>
      )}
    </div>
  )
}
