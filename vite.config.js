import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      selfDestroying: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'spanavi-shield.svg'],
      manifest: {
        name: 'Spanavi',
        short_name: 'Spanavi',
        description: '架電管理SaaS — 架電・アポ管理・録音・スクリプトを一元管理',
        theme_color: '#0D2247',
        background_color: '#0D2247',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-256x256.png',
            sizes: '256x256',
            type: 'image/png',
          },
          {
            src: 'pwa-384x384.png',
            sizes: '384x384',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Push notification handler (loaded alongside generated SW)
        importScripts: ['sw-push.js'],
        // Capital (Caesar移植) 取り込みでバンドル肥大化→プリキャッシュ上限を 5MB に拡張
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // 静的アセットをプリキャッシュ
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff,woff2}'],
        // 拡張子付きURL（テンプレDL等）はSPAシェル(index.html)にフォールバックさせない。
        // これが無いと /spacareer-templates/*.pptx への遷移が index.html を返し、
        // アプリが既定ページ（架電画面）に着地して「テンプレDLで架電リストが出る」不具合になる。
        navigateFallbackDenylist: [/\.[^./?]+(\?.*)?$/],
        // APIコール（Supabase）はネットワークファースト
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash]-v3.js`,
        chunkFileNames: `assets/[name]-[hash]-v3.js`,
        assetFileNames: `assets/[name]-[hash]-v3.[ext]`,
      }
    }
  },
  esbuild: {
    drop: command === 'build' ? ['console', 'debugger'] : [],
  },
}))
