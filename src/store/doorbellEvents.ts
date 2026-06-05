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
  push: (event: DoorbellEvent) => void
  clear: () => void
}

const MAX = 50

/** Runtime-only ring log (last N events) — feeds the security/notification widgets. */
export const useDoorbellEvents = create<DoorbellEventStore>((set) => ({
  events: [],
  push: (event) => set((s) => ({ events: [event, ...s.events].slice(0, MAX) })),
  clear: () => set({ events: [] }),
}))
