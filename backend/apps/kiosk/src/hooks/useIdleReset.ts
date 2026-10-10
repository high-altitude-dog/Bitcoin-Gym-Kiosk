import { useEffect, useRef } from "react"

const IDLE_MS = 60_000
// Turning the tablet counts as activity: someone is standing there.
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "resize", "orientationchange"] as const

// `enabled: false` suspends the timer entirely rather than just not firing
// it, since a member paying from their phone won't touch the tablet for the
// life of an invoice (up to its expiry) and that must not clear their cart.
export function useIdleReset(onIdle: () => void, enabled = true) {
  const onIdleRef = useRef(onIdle)

  useEffect(() => {
    onIdleRef.current = onIdle
  })

  useEffect(() => {
    if (!enabled) return

    let timer = setTimeout(() => onIdleRef.current(), IDLE_MS)

    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => onIdleRef.current(), IDLE_MS)
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, reset)
    }

    return () => {
      clearTimeout(timer)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, reset)
      }
    }
  }, [enabled])
}
