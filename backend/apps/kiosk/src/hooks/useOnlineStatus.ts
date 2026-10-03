import { useEffect, useState } from "react"

// navigator.onLine reflects the local network link (wifi connected or not),
// which is exactly the "wifi blip" this is meant to catch — not whether the
// Medusa backend itself is reachable. Catalog/payment calls already retry
// and surface their own errors for that.
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])

  return isOnline
}
