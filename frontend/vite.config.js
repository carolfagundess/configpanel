import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind mounts do Docker Desktop no Windows não propagam eventos de
    // filesystem de forma confiável — sem polling o HMR não detecta mudanças.
    watch: {
      usePolling: true,
    },
  },
})
