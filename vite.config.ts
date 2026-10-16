import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.png', 'icons/mark-dark.svg', 'icons/mark-light.svg'],
      manifest: {
        name: 'Accrynt — Personal Finance',
        short_name: 'Accrynt',
        description: 'A private, offline-first personal finance workspace.',
        theme_color: '#151c20',
        background_color: '#151c20',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}']
      }
    })
  ],
  test: { environment: 'node', include: ['src/tests/**/*.spec.ts'], setupFiles: ['src/tests/setup.ts'] }
})
