/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/project-sailing/").
const base = process.env.BASE_PATH ?? '/';

/**
 * Content-Security-Policy for the built app: only our own scripts run, so an
 * injected <script> or inline handler cannot read the sign-in token.
 * Network access stays open (https/wss) because the server, the weather and the
 * instrument gateway are set by the user. Not in dev (Vite injects inline scripts).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss: ws: http://localhost:* http://127.0.0.1:*",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const csp = {
  name: 'csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  worker: { format: 'es' },
  plugins: [
    react(),
    csp,
    VitePWA({
      // P-043: a new version waits and is applied by the app only when no session runs.
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Navigator — ιστιοπλοΐα ORC',
        short_name: 'Navigator',
        description: 'Targets, VMG, πανιά και διορθωμένος χρόνος ORC',
        lang: 'el',
        theme_color: '#0b2a4a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Map tiles, styles and fonts are cached as they are viewed, so areas
        // seen once (e.g. while planning at home) work offline at sea.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/styles\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'map-styles' },
          },
          {
            // The tileset description names the current tile version: take it fresh
            // when online (the cached copy only offline), so tiles never point to an old set.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/planet\/?$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'map-tilejson', networkTimeoutSeconds: 6 },
          },
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 86400 } },
          },
          {
            urlPattern: /^https:\/\/tiles\.openseamap\.org\//,
            handler: 'CacheFirst',
            options: { cacheName: 'seamarks', expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 86400 } },
          },
          {
            // Depth bands and contours (EMODnet WMS): the sea floor rarely changes.
            urlPattern: /^https:\/\/ows\.emodnet-bathymetry\.eu\/wms\?/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'bathymetry',
              expiration: { maxEntries: 4000, maxAgeSeconds: 90 * 86400 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
