import { useEffect, useState } from 'react'
import { addonUpdatePhase, findAddonUpdateEntity, type AddonUpdatePhase } from '../lib/addonUpdate'
import { useEntityStore } from '../store/entities'

export interface AddonUpdateState {
  phase: AddonUpdatePhase
  percentage: number | null
  installedVersion?: string
  latestVersion?: string
}

/**
 * Segue l'aggiornamento dell'add-on per mostrarlo sul kiosk.
 *
 * Una volta partito, l'aggiornamento resta "in corso" anche quando lo stream
 * cade — è il servizio che si sta sostituendo, non un guasto — e si conclude
 * solo al ritorno della connessione.
 */
export function useAddonUpdate(): AddonUpdateState {
  const entities = useEntityStore((state) => state.entities)
  const connected = useEntityStore((state) => state.connectionStatus === 'connected')
  const addon = findAddonUpdateEntity(entities)
  const inProgress = addon?.inProgress === true

  // Stato derivato aggiustato in render (non in un effect): evita il giro di
  // render in più e mantiene `started` monotono per tutta la sessione.
  const [started, setStarted] = useState(false)
  if (inProgress && !started) setStarted(true)

  // L'ultima percentuale nota sopravvive ai delta che non la riportano.
  const [percentage, setPercentage] = useState<number | null>(null)
  const reported = addon ? entities[addon.entityId]?.attributes?.update_percentage : undefined
  if (typeof reported === 'number' && Number.isFinite(reported) && reported !== percentage) {
    setPercentage(reported)
  }

  const phase = addonUpdatePhase({ inProgress, connected, started })

  useEffect(() => {
    if (phase !== 'done') return
    // Il servizio è tornato con il bundle nuovo: senza ricarica il tablet
    // continuerebbe a eseguire quello vecchio, che è esattamente il problema
    // che questo schermo esiste per rendere visibile.
    const timer = setTimeout(() => window.location.reload(), 2500)
    return () => clearTimeout(timer)
  }, [phase])

  return {
    phase,
    percentage,
    installedVersion: addon?.installedVersion,
    latestVersion: addon?.latestVersion,
  }
}
