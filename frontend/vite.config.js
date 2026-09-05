import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.png','apple-touch-icon.png','og-cover.jpg','svg/*.svg'],
    manifest: {
      name: "Krystal's Flower Kreations",
      short_name: 'Krystal Bloom',
      description: 'Perth WA paper florist — everlasting Cricut + origami bouquets, custom configurator & workshops',
      theme_color: '#B85C5C',
      background_color: '#FFF7F0',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: 'favicon.png', sizes: '48x48', type: 'image/png' },
        { src: 'apple-touch-icon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'apple-touch-icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,jpg}'],
      runtimeCaching: [
        { urlPattern: /^https:\/\/picsum\.photos\/.*/i, handler: 'CacheFirst', options: { cacheName: 'picsum-images', expiration: { maxEntries: 100, maxAgeSeconds: 30*24*60*60 } } },
        { urlPattern: /\/api\/products.*/i, handler: 'NetworkFirst', options: { cacheName: 'api-products', networkTimeoutSeconds: 4, expiration: { maxEntries: 50, maxAgeSeconds: 5*60 } } },
        { urlPattern: /\/3d\/.*/i, handler: 'CacheFirst', options: { cacheName: 'bouquet-glbs', expiration: { maxEntries: 20, maxAgeSeconds: 30*24*60*60 } } },
        { urlPattern: /notebooklm\.google\.com/i, handler: 'NetworkFirst', options: { cacheName: 'notebooklm', expiration: { maxEntries: 10, maxAgeSeconds: 60*60 } } }
      ]
    }
  })],
  server: { proxy: { '/api': 'http://localhost:3001' } },
  build: { outDir: 'dist', sourcemap: false, cssCodeSplit: true },
  preview: { port: 5173 },
});
