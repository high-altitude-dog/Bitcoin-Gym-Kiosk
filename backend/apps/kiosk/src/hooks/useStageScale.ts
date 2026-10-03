import { useEffect, useState } from "react"
import { KIOSK } from "../lib/stageConfig"

/** Scale for the fixed 1200x1920 stage so it fills the viewport (letterboxed if the aspect differs). */
export function useStageScale() {
  const calc = () => {
    const { width, height } = KIOSK.stage
    const s = Math.min(window.innerWidth / width, window.innerHeight / height)
    return { scale: s, x: (window.innerWidth - width * s) / 2, y: (window.innerHeight - height * s) / 2 }
  }
  const [v, setV] = useState(calc)
  useEffect(() => {
    const on = () => setV(calc())
    window.addEventListener("resize", on)
    window.addEventListener("orientationchange", on)
    return () => {
      window.removeEventListener("resize", on)
      window.removeEventListener("orientationchange", on)
    }
  }, [])
  return v
}
