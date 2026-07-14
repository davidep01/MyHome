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

interface CameraStreamProps {
  entityId: string
  fit?: 'cover' | 'contain'
  className?: string
  muted?: boolean
  /**
   * Skip HLS and start straight from MJPEG: ~live latency for answer-the-door
   * use (HLS trails by a few seconds). Used by the doorbell alert.
   */
  preferLive?: boolean
}

/**
 * Format-agnostic camera view. The browser holds no HA socket or token: the
 * HLS playlist URL is signed by the backend (`/api/ha/camera-hls-url`) and
 * every stream flows through the same-origin proxy. Chain, in order:
 *   1. HLS     — backend-signed `camera/stream` + hls.js (skipped by preferLive).
 *   2. MJPEG   — /camera_proxy_stream.
 *   3. Snapshot— polled stills.
 *   4. Error   — nothing worked.
 * (WebRTC/talk-back went away with the in-browser HA socket; it returns with a
 * backend signaling proxy — see docs/DOMINICA.md.)
 */
type Mode = 'connecting' | 'hls' | 'mjpeg' | 'snapshot' | 'error' | 'paused'

export function CameraStream({ entityId, fit = 'cover', className, muted = true, preferLive = false }: CameraStreamProps) {
  const entity = useHAEntity(entityId)
  const videoRef = useRef<HTMLVideoElement>(null)
  const { ref: containerRef, active } = useActiveWhenVisible<HTMLDivElement>()
  const [mode, setMode] = useState<Mode>('connecting')
  const [snap, setSnap] = useState('')
  const unavailable = !entity || entity.state === 'unavailable'
  const cameraLabel = (entity?.attributes?.friendly_name as string | undefined) ?? entityId
  // Il MJPEG di certe camere (Ring) non emette MAI un frame finché lo stream
  // live non parte: senza onError l'<img> resta nera per sempre. Questi ref
  // alimentano il watchdog e il fallback dell'handler onError in render.
  const mjpegLoadedRef = useRef(false)
  const mjpegFallbackRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (unavailable) { setMode('error'); return }
    // Don't stream while off-screen or with the display off — the effect's
    // cleanup tears down any existing stream when `active` flips to false.
    if (!active) { setMode('paused'); return }

    let cancelled = false
    let hls: Hls | null = null
    let watchdog: ReturnType<typeof setTimeout> | null = null
    setMode('connecting')

    const goSnapshot = () => { if (!cancelled) setMode('snapshot') }

    const startHls = async (onFail: () => void) => {
      const video = videoRef.current
      if (!video) return onFail()
      try {
        // hls.js è pesante (~250KB): caricato solo quando serve davvero uno stream HLS.
        const { default: Hls } = await import('hls.js/light')
        const resp = await haApi.cameraHlsUrl(entityId)
        if (cancelled) return
        const src = toProxiedHlsUrl(resp.url)
        if (Hls.isSupported()) {
          hls?.destroy()
          hls = new Hls({ enableWorker: true, backBufferLength: 30 })
          hls.loadSource(src); hls.attachMedia(video)
          hls.on(Hls.Events.MANIFEST_PARSED, () => { if (!cancelled) { setMode('hls'); video.play().catch(() => {}) } })
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal || cancelled) return
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { try { hls?.recoverMediaError(); return } catch { /* fall through */ } }
            onFail()
          })
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src
          video.addEventListener('loadedmetadata', () => { if (!cancelled) { setMode('hls'); video.play().catch(() => {}) } }, { once: true })
          video.addEventListener('error', onFail, { once: true })
        } else onFail()
      } catch {
        onFail() // HLS unsupported by this camera → fallback successivo
      }
    }

    const startMjpeg = () => {
      if (cancelled) return
      mjpegLoadedRef.current = false
      setMode('mjpeg')
      // Watchdog: nessun frame entro 4s (camera che non streama) → prova HLS,
      // e se anche quello fallisce → snapshot. L'onError dell'<img> usa lo
      // stesso fallback (via ref), così il percorso è unico.
      mjpegFallbackRef.current = () => { if (!cancelled) void startHls(goSnapshot) }
      if (watchdog) clearTimeout(watchdog)
      watchdog = setTimeout(() => {
        if (!cancelled && !mjpegLoadedRef.current) mjpegFallbackRef.current()
      }, 4000)
    }

    if (preferLive) startMjpeg()
    else void startHls(() => {
      // Catena classica: HLS → MJPEG → snapshot (watchdog incluso).
      startMjpeg()
      mjpegFallbackRef.current = goSnapshot
      if (watchdog) clearTimeout(watchdog)
      watchdog = setTimeout(() => {
        if (!cancelled && !mjpegLoadedRef.current) goSnapshot()
      }, 4000)
    })

    return () => {
      cancelled = true
      if (watchdog) clearTimeout(watchdog)
      hls?.destroy()
    }
  }, [entityId, preferLive, unavailable, active])

  // ── Snapshot polling — only once MJPEG has failed ──
  useEffect(() => {
    if (mode !== 'snapshot') return
    const tick = () => setSnap(`${getCameraProxyUrl(entityId)}?_t=${Date.now()}`)
    tick()
    const id = setInterval(tick, 2000)
    return () => clearInterval(id)
  }, [mode, entityId])

  const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover'

  return (
    <div ref={containerRef} className={cn('relative h-full w-full overflow-hidden bg-[#15171c]', className)}>
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
          className={cn('absolute inset-0 h-full w-full', fitClass)}
          onLoad={() => { mjpegLoadedRef.current = true }}
          onError={() => mjpegFallbackRef.current()}
        />
      )}

      {mode === 'snapshot' && snap && (
        <img src={snap} alt={`Immagine videocamera: ${cameraLabel}`} className={cn('absolute inset-0 h-full w-full', fitClass)} onError={() => setMode('error')} />
      )}

      {mode === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
        </div>
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
