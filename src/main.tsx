import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installChunkRecovery } from './lib/chunkRecovery'
import { cleanupLegacyServiceWorkers } from './lib/serviceWorkerCleanup'
import { bootstrapAppearance } from './lib/themeAppearance'

void cleanupLegacyServiceWorkers()
bootstrapAppearance()
installChunkRecovery()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
