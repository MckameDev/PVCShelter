import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useGameStore } from './store/useGameStore'

// Solo en desarrollo: acceso al store desde la consola / pruebas automatizadas.
// En el build de producción import.meta.env.DEV es false y esto se elimina.
if (import.meta.env.DEV) {
  Object.assign(window, { __pvcStore: useGameStore })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
