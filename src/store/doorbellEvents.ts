import { create } from 'zustand'

export interface DoorbellEvent {
  id: string
  doorbellId: string
  doorbellName: string
  timestamp: string
  type: 'press' | 'motion' | 'offline' | 'online'
  message?: string
}

interface DoorbellEventStore {
  events: DoorbellEvent[]
  /** Suonata di prova in arrivo dal backend (Funzioni → Campanelli → Prova). */
  testRing: { doorbellId: string; at: number } | null
  push: (event: DoorbellEvent) => void
  triggerTest: (doorbellId: string) => void
  clear: () => void
}

const MAX = 50

/** Runtime-only ring log (last N events) — feeds the security/notification widgets. */
export const useDoorbellEvents = create<DoorbellEventStore>((set) => ({
  events: [],
  testRing: null,
  push: (event) => set((s) => ({ events: [event, ...s.events].slice(0, MAX) })),
  triggerTest: (doorbellId) => set({ testRing: { doorbellId, at: Date.now() } }),
  clear: () => set({ events: [] }),
}))
