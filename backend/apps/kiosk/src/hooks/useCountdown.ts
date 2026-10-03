import { useEffect, useState } from "react"

// Ticks once a second so a countdown display stays in sync with expiresAt,
// without the caller having to manage its own timer.
export function useCountdown(expiresAt: number): number {
  const [msLeft, setMsLeft] = useState(() => Math.max(0, expiresAt - Date.now()))

  useEffect(() => {
    setMsLeft(Math.max(0, expiresAt - Date.now()))
    const timer = setInterval(() => {
      setMsLeft(Math.max(0, expiresAt - Date.now()))
    }, 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  return msLeft
}

export function formatCountdown(msLeft: number): string {
  const totalSeconds = Math.ceil(msLeft / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}
