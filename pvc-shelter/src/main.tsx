import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.tsx'
import { useGameStore } from './store/useGameStore'
import { useSessionStore } from './store/useSessionStore'

// Solo en desarrollo: acceso al store desde la consola / pruebas automatizadas.
// En el build de producción import.meta.env.DEV es false y esto se elimina.
if (import.meta.env.DEV) {
  Object.assign(window, { __pvcStore: useGameStore, __pvcSession: useSessionStore })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
