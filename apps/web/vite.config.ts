import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const apiProxy = {
  '/api': {
    target: process.env.KINSEN_API_TARGET ?? 'http://127.0.0.1:3001',
    changeOrigin: true,
  },
}

export default defineConfig({
  envDir: '../..',
  envPrefix: ['VITE_', 'CLERK_PUBLISHABLE_KEY'],
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Kinsen — Daily Budget Planner',
        short_name: 'Kinsen',
        description: 'Know what you can safely spend today.',
        theme_color: '#f5f4ee',
        background_color: '#f5f4ee',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
    }),
  ],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    clearMocks: true,
  },
})
