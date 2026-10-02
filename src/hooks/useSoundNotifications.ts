import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { soundManager, type SoundPreset } from '../lib/sound/SoundManager'

type PlayOptions = Parameters<typeof soundManager.play>[1]

/** Reactive wrapper over the central SoundManager (mute/volume/play). */
export function useSoundNotifications() {
  const muted = useSyncExternalStore(soundManager.subscribe, () => soundManager.isMuted(), () => false)
  const volume = useSyncExternalStore(soundManager.subscribe, () => soundManager.getVolume(), () => 0.7)

  // Arm the autoplay unlock once.
  useEffect(() => { soundManager.init() }, [])

  const setMuted = useCallback((m: boolean) => { soundManager.setMuted(m) }, [])
  const setVolume = useCallback((v: number) => { soundManager.setVolume(v) }, [])
  const play = useCallback((preset: SoundPreset, opts?: PlayOptions) => soundManager.play(preset, opts), [])

  return { muted, volume, setMuted, setVolume, play }
}
