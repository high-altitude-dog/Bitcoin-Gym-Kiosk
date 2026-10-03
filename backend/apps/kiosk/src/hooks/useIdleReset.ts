import { useEffect, useRef } from "react"

const IDLE_MS = 60_000
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown"] as const

export function useIdleReset(onIdle: () => void) {
  const onIdleRef = useRef(onIdle)

  useEffect(() => {
    onIdleRef.current = onIdle
  })

  useEffect(() => {
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
  }, [])
}
