/** HA capabilities, not the camera name, determine which live transports exist. */
export function cameraTransportPolicy(types?: readonly string[]) {
  const nativeOnly = types?.includes('web_rtc') === true && !types.includes('hls')
  return {
    webRtc: types === undefined || types.includes('web_rtc'),
    hls: types === undefined || types.includes('hls'),
    // A native-only camera can expose an MJPEG of its LAST RECORDING (Ring).
    // That response must never be presented as a live fallback.
    mjpeg: !nativeOnly,
    negotiationMs: nativeOnly ? 45_000 : 18_000,
    failureBackoffMs: nativeOnly ? 10_000 : 30_000,
  }
}

export type CameraPlaybackStatus = 'connecting' | 'webrtc' | 'hls' | 'mjpeg' | 'snapshot' | 'error' | 'paused' | 'play-required'
export const CAMERA_STATUS_LABELS: Record<CameraPlaybackStatus, string> = {
  connecting: 'Connessione video in corso', webrtc: 'Diretta · WebRTC', hls: 'Diretta · HLS',
  mjpeg: 'Diretta · MJPEG', snapshot: 'Ultima immagine · non in diretta', error: 'Diretta non disponibile',
  paused: 'Video sospeso', 'play-required': 'Tocca per avviare il video',
}
