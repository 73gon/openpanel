import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const config = defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    viteReact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-dark-transparent.png'],
      manifest: {
        short_name: 'OpenPanel',
        name: 'OpenPanel — Manga Reader',
        icons: [
          {
            src: 'logo-dark-transparent.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        start_url: '.',
        display: 'standalone',
        theme_color: '#000000',
        background_color: '#ffffff',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /^\/api\/page\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'page-images',
              expiration: { maxEntries: 500, maxAgeSeconds: 86400 * 7 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          router: ['@tanstack/react-router'],
          'ui-vendor': ['@base-ui/react', 'motion'],
          cmdk: ['cmdk'],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

export default config
