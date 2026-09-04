import { useEffect, useMemo, useRef, useState } from 'react'
import type { AttentionItem } from '../lib/attention'
import { pruneExpired, type AttentionSnoozeMap } from '../lib/attentionSnooze'

const STORAGE_KEY = 'myhome.attentionSnoozes'

function readStored(): AttentionSnoozeMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as AttentionSnoozeMap : {}
  } catch {
    return {}
  }
}

function writeStored(snoozes: AttentionSnoozeMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snoozes))
  } catch {
    // localStorage non disponibile (privacy mode, quota) — il posticipo resta solo in memoria per questa sessione.
  }
}

/**
 * Posticipo/ignora per voce di "Attenzione" — per-dispositivo, non sincronizzato
 * via config (stesso principio di `myhome.home`/`myhome.haStream`): è una
 * comodità diagnostica locale, non uno stato di sicurezza condiviso — le voci
 * di sicurezza/intrusione restano comunque sempre visibili ovunque.
 */
export function useAttentionSnoozes(items: AttentionItem[]) {
  const [snoozes, setSnoozes] = useState<AttentionSnoozeMap>(readStored)
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  // Pulizia periodica di comodità (posticipi scaduti / condizione cambiata):
  // `isSnoozed` è già corretto anche senza questo effetto, quindi il setState
  // vive solo nel callback del timer, mai in modo sincrono dentro l'effetto.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setSnoozes((current) => {
        const pruned = pruneExpired(current, itemsRef.current, Date.now())
        if (JSON.stringify(pruned) === JSON.stringify(current)) return current
        writeStored(pruned)
        return pruned
      })
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  return useMemo(() => ({
    snoozes,
    snoozeFor: (id: string, minutes: number) => {
      const next = { ...snoozes, [id]: { until: Date.now() + minutes * 60_000 } }
      setSnoozes(next)
      writeStored(next)
    },
    ignoreUntilChanged: (item: AttentionItem) => {
      const next = { ...snoozes, [item.id]: { fingerprint: item.fingerprint } }
      setSnoozes(next)
      writeStored(next)
    },
    clear: (id: string) => {
      const next = { ...snoozes }
      delete next[id]
      setSnoozes(next)
      writeStored(next)
    },
  }), [snoozes])
}
