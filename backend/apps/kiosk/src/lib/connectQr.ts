// What the "Conéctate" screen's two QR codes hold (reached from the faint Wi-Fi
// button on the start screen).

// The gym's password-protected Wi-Fi, as a standard Wi-Fi QR payload
// (`WIFI:T:WPA;S:<network name>;P:<password>;;`, with \ ; , : " escaped by a
// backslash), base64-encoded in VITE_WIFI_QR_B64 so the password stays out of
// git (it lives in the git-ignored .env.production on the VM) and dotenv can't
// mangle a `$` in it. Unset shows a placeholder. It still ships in the public
// web bundle, like anything the kiosk displays.
export const WIFI_QR_PAYLOAD: string | null = decodeBase64(import.meta.env.VITE_WIFI_QR_B64)

function decodeBase64(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

// The open-gym PWA that lets members get into the gym.
export const OPEN_GYM_URL = "https://high-altitude-dog.github.io/open-gym/"
