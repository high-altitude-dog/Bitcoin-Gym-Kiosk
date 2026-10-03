import { useEffect, useState } from "react"
import { KIOSK } from "../lib/stageConfig"

export function useClock() {
  const fmt = () => new Intl.DateTimeFormat(KIOSK.locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date())
  const [now, setNow] = useState(fmt)
  useEffect(() => {
    const id = window.setInterval(() => setNow(fmt()), 10_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}
