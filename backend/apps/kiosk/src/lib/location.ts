// Which gym this kiosk is at, from the link it was opened with
// (https://paywithbitcoin.lol/?location=calacoto). Remembered on the device, so
// reloads and the idle reset keep it; Fully Kiosk's start URL carries it too.
// Sent to the backend with every request (lib/medusa.ts), which allows bank QR
// and cash only for known locations (backend lib/kiosk-location.ts).
const KEY = "kiosk-location"

function readLocation(): string | null {
  if (typeof window === "undefined") return null
  const fromLink = new URLSearchParams(window.location.search).get("location")?.trim().toLowerCase() || null
  try {
    if (fromLink) window.localStorage.setItem(KEY, fromLink)
    return fromLink ?? window.localStorage.getItem(KEY)
  } catch {
    return fromLink
  }
}

export const KIOSK_LOCATION = readLocation()
