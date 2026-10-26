import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { zonFonts } from '@zonsh/ui/vite'

// The OpenPanel server the dev server proxies /api to.
const apiTarget = process.env.OPENPANEL_API_TARGET ?? 'http://localhost:3001'

const config = defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    viteReact(),
    // Licht, Licht Sans and Licht Mono are requested from /licht/fonts on our own origin and
    // proxied to zon.sh (in production the OpenPanel server does the same).
    zonFonts(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-dark.png', 'favicon.svg', 'theme.js'],
      manifest: {
        short_name: 'OpenPanel',
        name: 'OpenPanel — Manga Reader',
        icons: [
          {
            src: 'logo-dark.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        start_url: '.',
        display: 'standalone',
        // The zon dark ground, oklch(0.07 0 0).
        theme_color: '#010101',
        background_color: '#010101',
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/licht\//],
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
          {
            // The faces are unversioned: serve the cached copy (so offline reading keeps its
            // type) and fetch the current release behind it.
            urlPattern: ({ url }) => url.pathname.startsWith('/licht/fonts/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'licht-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 86400 * 30 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: ['es2020', 'chrome87', 'safari14', 'firefox78', 'edge88'],
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@tanstack/react-router/'))
            return 'router'
          // The chart kit stays out: with it would come Recharts, which only the stats page needs.
          if (
            (id.includes('/node_modules/@zonsh/ui/') &&
              !id.includes('/components/chart')) ||
            id.includes('/node_modules/@base-ui/')
          )
            return 'ui-vendor'
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
})

export default config
