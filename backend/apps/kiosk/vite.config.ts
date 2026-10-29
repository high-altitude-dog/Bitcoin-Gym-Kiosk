import react from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Precaches the app shell (HTML/JS/CSS/images) so a wifi blip on the
    // kiosk tablet shows the already-loaded app (which then renders its own
    // "Reconnecting..." state) instead of the browser's blank offline page.
    // Not a PWA installability concern here, just an offline-first shell.
    //
    // Cast needed because vite-plugin-pwa is hoisted to the workspace root
    // and resolves its own "vite" types against the root's vite (pulled in
    // at ^7 by apps/backend), while this app is deliberately pinned to
    // vite ^6.3.5 (see CLAUDE.md) and gets its own nested copy — same
    // package, two structurally-incompatible type identities.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,webp,woff2,webm,mp3}'],
        navigateFallback: 'index.html',
      },
    }) as unknown as PluginOption,
  ],
})
