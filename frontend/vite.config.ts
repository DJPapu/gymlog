import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    fs: { allow: ['..'] },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'GymLog',
        short_name: 'GymLog',
        description: 'Planifica y registra tus sesiones de gimnasio',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'es',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // GET al backend: NetworkOnly (no caché, pasa directo a red)
            urlPattern: /^https:\/\/gymlog-5y6y\.onrender\.com\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // POST al backend: hay que registrarlo explícitamente para que el SW
            // llame respondWith() en iOS WebKit — si no lo hace, WebKit falla la
            // request con "Load failed" en lugar de pasarla a la red (bug de WKWebView).
            urlPattern: /^https:\/\/gymlog-5y6y\.onrender\.com\/.*/i,
            handler: 'NetworkOnly',
            method: 'POST',
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-cache', networkTimeoutSeconds: 10 },
          },
        ],
      },
    }),
  ],
})
