import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// BASE_PATH permite servir la app desde un subdirectorio (p.ej. GitHub Pages: /BaroB/).
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'] },
      manifest: {
        name: 'BaroB',
        short_name: 'BaroB',
        description: 'Gastos compartidos del hogar, proporcionales a los ingresos.',
        lang: 'es-AR',
        theme_color: '#111412',
        background_color: '#111412',
        display: 'standalone',
        orientation: 'portrait',
        start_url: `${base}#/start`,
        scope: base,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Nuevo gasto', url: `${base}#/add`, icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Mes en curso', url: `${base}#/`, icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
        ],
      },
    }),
  ],
})
