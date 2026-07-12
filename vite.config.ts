import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['Tracr.svg', 'apple-touch-icon.png'],
      pwaAssets: {
        image: 'public/Tracr.svg',
      },
      manifest: {
        name: 'Tracr',
        short_name: 'Tracr',
        description: 'A friendly, simple way to see all your money in one place.',
        theme_color: '#0072bc',
        background_color: '#0c1219',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['finance', 'productivity'],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        // Pull our Web Push handlers into the generated service worker.
        importScripts: ['push-sw.js'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
