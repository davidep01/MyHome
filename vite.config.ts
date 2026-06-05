import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    // Service worker disabled for kiosk use (Fully Kiosk loads the URL directly).
    // The SW only caused stale builds — tablets kept serving an old cached shell.
    // `selfDestroying` ships a SW that unregisters any previously installed one
    // and clears its caches, so existing tablets clean themselves up and then
    // always load fresh from the server. Can be dropped entirely once every
    // client has loaded this build at least once.
    VitePWA({ selfDestroying: true }),
  ],
  server: {
    proxy: {
      '/ha': {
        target: process.env.VITE_HA_URL ?? 'http://homeassistant.local:8123',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ha/, ''),
      },
      '/api': {
        target: process.env.VITE_BACKEND_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/ha': {
        target: process.env.VITE_HA_URL ?? 'http://homeassistant.local:8123',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ha/, ''),
      },
      '/api': {
        target: process.env.VITE_BACKEND_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
