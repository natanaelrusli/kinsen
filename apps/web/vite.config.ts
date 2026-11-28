import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'

// One id per build, shared by the bundle (__APP_BUILD_ID__) and /version.json so
// a running app can tell when a newer build has been deployed.
const buildId = Date.now().toString(36)

function versionFile(): Plugin {
  return {
    name: 'kinsen-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId }) })
    },
  }
}

const apiProxy = {
  '/api': {
    target: process.env.KINSEN_API_TARGET ?? 'http://127.0.0.1:3001',
    changeOrigin: true,
  },
}

export default defineConfig({
  envDir: '../..',
  envPrefix: ['VITE_', 'CLERK_PUBLISHABLE_KEY'],
  define: { __APP_BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Kinsen — Daily Budget Planner',
        short_name: 'Kinsen',
        description: 'Know what you can safely spend today.',
        theme_color: '#f5f4ee',
        background_color: '#f5f4ee',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
    }),
  ],
  server: { host: process.env.WEB_HOST ?? '127.0.0.1', port: Number(process.env.WEB_PORT ?? 5173), strictPort: true, proxy: apiProxy },
  preview: { host: process.env.WEB_HOST ?? '127.0.0.1', proxy: apiProxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    clearMocks: true,
  },
})
