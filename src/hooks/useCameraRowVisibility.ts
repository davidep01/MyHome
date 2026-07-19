import { useCallback, useState } from 'react'

/**
 * Abilitazione live valida soltanto per la sessione corrente della dashboard.
 * Ogni mount riparte chiuso: Ring non deve ricevere richieste stream finché
 * l'utente non preme esplicitamente il pulsante videocamera nella status bar.
 */
export function useCameraRowVisibility() {
  const [cameraRowVisible, setCameraRowVisible] = useState(false)
  const toggleCameraRow = useCallback(() => {
    setCameraRowVisible((current) => !current)
  }, [])
  return { cameraRowVisible, toggleCameraRow }
}
