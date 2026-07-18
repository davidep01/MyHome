import { create } from 'zustand'

export type KioskAudioStatus = 'initializing' | 'ready' | 'needs-interaction' | 'error'

interface KioskAudioStore {
  status: KioskAudioStatus
  playing: boolean
  _patch: (patch: Partial<Pick<KioskAudioStore, 'status' | 'playing'>>) => void
}

export const useKioskAudioStore = create<KioskAudioStore>((set) => ({
  status: 'initializing',
  playing: false,
  _patch: (patch) => set(patch),
}))
