import { useCallback, useEffect, useState } from 'react'
import { soundManager, type SoundPreset } from '../lib/sound/SoundManager'

type PlayOptions = Parameters<typeof soundManager.play>[1]

/** Reactive wrapper over the central SoundManager (mute/volume/play). */
export function useSoundNotifications() {
  const [muted, setMutedState] = useState(() => soundManager.isMuted())
  const [volume, setVolumeState] = useState(() => soundManager.getVolume())

  // Arm the autoplay unlock once.
  useEffect(() => { soundManager.init() }, [])

  const setMuted = useCallback((m: boolean) => { soundManager.setMuted(m); setMutedState(m) }, [])
  const setVolume = useCallback((v: number) => { soundManager.setVolume(v); setVolumeState(soundManager.getVolume()) }, [])
  const play = useCallback((preset: SoundPreset, opts?: PlayOptions) => soundManager.play(preset, opts), [])

  return { muted, volume, setMuted, setVolume, play }
}
