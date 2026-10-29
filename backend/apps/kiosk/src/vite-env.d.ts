/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_MEDUSA_BACKEND_URL: string
  readonly VITE_MEDUSA_PUBLISHABLE_KEY: string
  // The gym Wi-Fi QR payload, base64 (see src/lib/connectQr.ts). Optional.
  readonly VITE_WIFI_QR_B64?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
