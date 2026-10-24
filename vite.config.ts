import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import securityHeaders from './deployment/headers.json'

export default defineConfig({
  plugins: [
    // Exercise the provider-neutral host contract in production-preview tests.
    // Real hosting must apply these response headers separately; dist cannot do that.
    { name: 'preview-host-contract', configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        for (const [name, value] of Object.entries(securityHeaders)) res.setHeader(name, value)
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
        res.setHeader('Cache-Control', /^\/assets\/[^/]+-[\w-]+\.(js|css)$/.test(pathname)
          ? 'public, max-age=31536000, immutable' : 'no-cache')
        next()
      })
    } },
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
