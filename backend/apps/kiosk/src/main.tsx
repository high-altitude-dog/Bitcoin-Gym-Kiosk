import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
// Inter, Latin + Latin-ext subsets (covers Spanish: ¿ ¡ á é í ó ú ñ). Self-hosted so the
// kiosk's fonts work even if the gym's wifi drops, matching the app's existing offline design.
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
// The drawing room: its caption, and the brass plaques' small capitals.
import '@fontsource/playfair-display/700.css'
import '@fontsource/cormorant-garamond/700.css'
import './index.css'
import App from './App.tsx'

// Silent, automatic: a kiosk has no one to click "update available", so the
// new app shell is cached in the background and takes over on the next load.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
