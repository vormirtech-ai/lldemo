import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// base: './' lets the same build run from a domain root, a GitHub Pages sub-path,
// or inside the Capacitor Android shell.
export default defineConfig({
  base: './',
  // APK=1 builds the web bundle for the standalone Android APK (no service worker needed there)
  plugins: [
    preact(),
    ...(process.env.APK ? [] : [VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png', 'favicon.svg'],
      manifest: {
        name: 'Catering POS — Quotations & Billing',
        short_name: 'Catering POS',
        description: 'Catering quotations, final bills, POS and reports. Works offline.',
        theme_color: '#1B2A41',
        background_color: '#FBF6EC',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,ttf,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
      }
    })])
  ],
  build: { target: 'es2020', chunkSizeWarningLimit: 2500, outDir: process.env.APK ? 'dist-apk' : 'dist' },
  test: { environment: 'node', include: ['tests/**/*.test.js'] }
});
