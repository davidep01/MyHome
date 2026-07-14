import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  define: {
    'process.env': JSON.stringify({
      NODE_ENV: mode === 'production' ? 'production' : 'development',
      DRAGGABLE_DEBUG: false,
    }),
    // Build version (matches the add-on version) so a stale bundle is visible.
    __APP_VERSION__: JSON.stringify(process.env.GITHUB_RUN_NUMBER ? `2.2.${process.env.GITHUB_RUN_NUMBER}` : 'dev'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor stabili in chunk separati: a ogni release il kiosk riscarica
        // solo il codice app, non react/framer/grid (asset hashati `immutable`).
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-grid-layout')) return 'grid'
          if (id.includes('framer-motion')) return 'motion'
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}))
