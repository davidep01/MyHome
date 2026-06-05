/* eslint-disable react-hooks/set-state-in-effect --
   `mode` reflects the streaming negotiation lifecycle; transitioning it inside the
   connection effect (and on capability/error/timeout) is the intended behaviour. */
import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Mic, Video } from 'lucide-react'
import type { Connection } from 'home-assistant-js-websocket'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useActiveWhenVisible } from '../../hooks/useActiveWhenVisible'
import { getConnection } from '../../api/ha-websocket'
import { getCameraStreamUrl, getCameraProxyUrl, toProxiedHlsUrl } from '../../api/ha-rest'
import { cn } from '../../lib/utils'

interface CameraStreamProps {
  entityId: string
  fit?: 'cover' | 'contain'
  className?: string
  muted?: boolean
  allowTalkback?: boolean
}

/**
 * Format-agnostic camera view — mirrors Home Assistant's own player. For every
 * camera it tries, in order, whatever actually works for that source:
 *   1. WebRTC  — modern `camera/webrtc/offer` subscription API (Ring, go2rtc…),
 *                with trickle ICE. This is the ONLY path that works for Ring.
 *   2. HLS     — `camera/stream` (format hls) + hls.js, proxied same-origin.
 *   3. MJPEG   — /camera_proxy_stream.
 *   4. Snapshot— polled stills.
 *   5. Error   — nothing worked.
 */
type Mode = 'connecting' | 'webrtc' | 'hls' | 'mjpeg' | 'snapshot' | 'error' | 'paused'

interface WebRtcEvent {
  type: 'session' | 'answer' | 'candidate' | 'offer' | 'error'
  session_id?: string
  answer?: string
  candidate?: string | RTCIceCandidateInit
  code?: string
  message?: string
}

export function CameraStream({ entityId, fit = 'cover', className, muted = true, allowTalkback = false }: CameraStreamProps) {
  const entity = useHAEntity(entityId)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioSenderRef = useRef<RTCRtpSender | null>(null)
  const micRef = useRef<MediaStream | null>(null)
  const { ref: containerRef, active } = useActiveWhenVisible<HTMLDivElement>()
  const [mode, setMode] = useState<Mode>('connecting')
  const [talking, setTalking] = useState(false)
  const [snap, setSnap] = useState('')
  const unavailable = !entity || entity.state === 'unavailable'

  useEffect(() => {
    if (unavailable) { setMode('error'); return }
    // Don't stream while off-screen or with the display off — the effect's
    // cleanup tears down any existing stream when `active` flips to false.
    if (!active) { setMode('paused'); return }

    let cancelled = false
    let pc: RTCPeerConnection | null = null
    let hls: Hls | null = null
    let unsub: (() => void) | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let hlsAttempt = 0
    setMode('connecting')

    const conn = getConnection() as Connection | null
    if (!conn) { setMode('mjpeg'); return }

    // ── 1. WebRTC (modern subscription API) ──
    const startWebRtc = async () => {
      let clientConfig: { configuration?: RTCConfiguration }
      try {
        clientConfig = await conn.sendMessagePromise({ type: 'camera/webrtc/get_client_config', entity_id: entityId })
      } catch {
        return startHls() // camera doesn't support WebRTC → try HLS
      }
      if (cancelled) return

      try {
        pc = new RTCPeerConnection(clientConfig?.configuration ?? { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
        pc.addTransceiver('video', { direction: 'recvonly' })
        const audioTx = pc.addTransceiver('audio', { direction: allowTalkback ? 'sendrecv' : 'recvonly' })
        audioSenderRef.current = audioTx.sender

        pc.ontrack = (e) => {
          if (cancelled) return
          if (videoRef.current) { videoRef.current.srcObject = e.streams[0]; videoRef.current.play().catch(() => {}) }
          setMode('webrtc')
        }
        pc.oniceconnectionstatechange = () => {
          if (cancelled || !pc) return
          if (pc.iceConnectionState === 'failed') retryHls() // give up WebRTC, try HLS
        }

        // Trickle ICE: buffer local candidates until the session id arrives.
        let sessionId: string | null = null
        const pending: RTCIceCandidateInit[] = []
        const sendCandidate = (cand: RTCIceCandidateInit) => {
          if (!sessionId) return
          conn.sendMessagePromise({ type: 'camera/webrtc/candidate', entity_id: entityId, session_id: sessionId, candidate: cand }).catch(() => {})
        }
        pc.onicecandidate = (e) => {
          if (!e.candidate) return
          const cand = e.candidate.toJSON()
          if (sessionId) sendCandidate(cand)
          else pending.push(cand)
        }

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        if (cancelled) return

        unsub = await conn.subscribeMessage<WebRtcEvent>(
          (msg) => {
            if (cancelled || !pc) return
            if (msg.type === 'session' && msg.session_id) {
              sessionId = msg.session_id
              pending.forEach(sendCandidate)
              pending.length = 0
            } else if (msg.type === 'answer' && msg.answer) {
              pc.setRemoteDescription({ type: 'answer', sdp: msg.answer }).catch(() => retryHls())
            } else if (msg.type === 'candidate' && msg.candidate) {
              const init = typeof msg.candidate === 'string' ? { candidate: msg.candidate } : msg.candidate
              pc.addIceCandidate(init).catch(() => {})
            } else if (msg.type === 'error') {
              retryHls()
            }
          },
          { type: 'camera/webrtc/offer', entity_id: entityId, offer: offer.sdp },
        )
      } catch {
        startHls()
      }
    }

    // ── 2. HLS (with retry) ──
    const retryHls = () => {
      if (cancelled) return
      unsub?.(); unsub = null
      pc?.close(); pc = null
      hls?.destroy(); hls = null
      if (hlsAttempt++ < 4) retryTimer = setTimeout(startHls, 1200)
      else goMjpeg()
    }

    const startHls = async () => {
      const video = videoRef.current
      if (!video) return goMjpeg()
      try {
        const resp = await conn.sendMessagePromise<{ url: string }>({ type: 'camera/stream', entity_id: entityId, format: 'hls' })
        if (cancelled) return
        const src = resp.url.startsWith('http') ? resp.url : toProxiedHlsUrl(resp.url)
        if (Hls.isSupported()) {
          hls?.destroy()
          hls = new Hls({ enableWorker: true, backBufferLength: 30 })
          hls.loadSource(src); hls.attachMedia(video)
          hls.on(Hls.Events.MANIFEST_PARSED, () => { if (!cancelled) { setMode('hls'); video.play().catch(() => {}) } })
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal || cancelled) return
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { try { hls?.recoverMediaError(); return } catch { /* retry */ } }
            goMjpeg()
          })
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src
          video.addEventListener('loadedmetadata', () => { if (!cancelled) { setMode('hls'); video.play().catch(() => {}) } }, { once: true })
          video.addEventListener('error', goMjpeg, { once: true })
        } else goMjpeg()
      } catch {
        goMjpeg() // HLS unsupported by this camera (e.g. Ring) → MJPEG/snapshot
      }
    }

    const goMjpeg = () => { if (!cancelled) setMode('mjpeg') }

    startWebRtc()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      unsub?.()
      hls?.destroy()
      micRef.current?.getTracks().forEach((t) => t.stop())
      micRef.current = null
      audioSenderRef.current = null
      pc?.getSenders().forEach((s) => s.track?.stop())
      pc?.close()
    }
  }, [entityId, allowTalkback, unavailable, active])

  // ── Snapshot polling — only once MJPEG has failed ──
  useEffect(() => {
    if (mode !== 'snapshot') return
    const tick = () => setSnap(`${getCameraProxyUrl(entityId)}?_t=${Date.now()}`)
    tick()
    const id = setInterval(tick, 2000)
    return () => clearInterval(id)
  }, [mode, entityId])

  const startTalk = async () => {
    if (!audioSenderRef.current) return
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
      micRef.current = mic
      await audioSenderRef.current.replaceTrack(mic.getAudioTracks()[0] ?? null)
      if (videoRef.current) videoRef.current.muted = false
      setTalking(true)
    } catch { /* mic denied */ }
  }
  const stopTalk = () => {
    micRef.current?.getTracks().forEach((t) => t.stop())
    micRef.current = null
    audioSenderRef.current?.replaceTrack(null).catch(() => {})
    setTalking(false)
  }

  const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover'
  const videoVisible = mode === 'webrtc' || mode === 'hls'

  return (
    <div ref={containerRef} className={cn('relative h-full w-full overflow-hidden bg-[#15171c]', className)}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={cn('absolute inset-0 h-full w-full transition-opacity duration-500', fitClass, videoVisible ? 'opacity-100' : 'opacity-0 pointer-events-none')}
      />

      {mode === 'mjpeg' && (
        <img src={getCameraStreamUrl(entityId)} alt="" className={cn('absolute inset-0 h-full w-full', fitClass)} onError={() => setMode('snapshot')} />
      )}

      {mode === 'snapshot' && snap && (
        <img src={snap} alt="" className={cn('absolute inset-0 h-full w-full', fitClass)} onError={() => setMode('error')} />
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

      {allowTalkback && mode === 'webrtc' && (
        <button
          onPointerDown={startTalk}
          onPointerUp={stopTalk}
          onPointerLeave={stopTalk}
          className={cn(
            'absolute bottom-3 right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full backdrop-blur transition active:scale-90',
            talking ? 'bg-[#0066cc] text-white ring-4 ring-[#0066cc]/30' : 'bg-white/20 text-white',
          )}
          aria-label="Tieni premuto per parlare"
        >
          <Mic size={20} />
        </button>
      )}
    </div>
  )
}
