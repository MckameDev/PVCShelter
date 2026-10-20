import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// En desarrollo, /api se redirige al servidor PHP (backend/public) para que el
// juego y la API compartan origen, igual que en producción (cookies de sesión
// SameSite=Strict y sin CORS). Cambia el destino con VITE_API_TARGET.
const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: apiTarget },
    },
  },
})
