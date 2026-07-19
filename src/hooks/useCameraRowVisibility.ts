import { useCallback, useState } from 'react'

const STORAGE_KEY = 'simi.camera-row-visible'

function initialVisibility(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(STORAGE_KEY) !== 'false'
}

/** Preferenza locale al singolo kiosk: la fila camere resta visibile di default. */
export function useCameraRowVisibility() {
  const [cameraRowVisible, setCameraRowVisible] = useState(initialVisibility)
  const toggleCameraRow = useCallback(() => {
    setCameraRowVisible((current) => {
      const next = !current
      window.localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])
  return { cameraRowVisible, toggleCameraRow }
}
