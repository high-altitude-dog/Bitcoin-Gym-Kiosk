import { useEffect, useState } from "react"
import { KIOSK } from "../lib/stageConfig"
import { t } from "../lib/strings"

// How long the "no connection" screen waits between automatic tries.
export const RETRY_SECONDS = 15

/**
 * Shown when the product list can't be loaded. Counts down from 15 s and
 * tries again by itself, so an unattended kiosk recovers when the backend or
 * the wifi comes back; "Reintentar ahora" tries at once. While a try is in
 * flight (`retrying`) the same screen stays up, so Byte keeps jumping instead
 * of the screen flickering through "Cargando..." every 15 seconds.
 */
export function ConnectionErrorScreen({
  message,
  retrying,
  onRetry,
}: {
  message: string
  retrying: boolean
  onRetry: () => void
}) {
  const [seconds, setSeconds] = useState(RETRY_SECONDS)

  useEffect(() => {
    // Reset as soon as a try starts, so the next failure begins at 15 again.
    if (retrying) {
      setSeconds(RETRY_SECONDS)
      return
    }
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [retrying])

  useEffect(() => {
    if (!retrying && seconds === 0) onRetry()
  }, [retrying, seconds, onRetry])

  return (
    <div className="screen screen--center conn-error">
      <ByteJumpRope />
      <p>{message}</p>
      <p className="conn-error__count" role="timer">
        {retrying ? t.retryingNow : t.retryingIn(seconds)}
      </p>
      <button className="primary-button" disabled={retrying} onClick={onRetry}>
        {t.retryNow}
      </button>
    </div>
  )
}

/**
 * Byte's jump-rope loop (Second's mascot, used with permission; from the
 * "Kiosko Byte, La Paz" art set). A looping WebM converted from the GIF
 * without altering it (114 KB against 1.2 MB, and it always starts at frame
 * 0). Its ground is #1c1c1c, the kiosk's own background, so it needs no
 * black screen. Reduced motion gets the first frame.
 */
function ByteJumpRope() {
  const base = `${KIOSK.assets}byte/`
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  return reduceMotion ? (
    <img className="conn-error__art" src={`${base}byte-jump-rope-still.png`} width={800} height={800} alt="" />
  ) : (
    <video
      className="conn-error__art"
      src={`${base}byte-jump-rope.webm`}
      poster={`${base}byte-jump-rope-still.png`}
      width={800}
      height={800}
      autoPlay
      loop
      muted
      playsInline
      disablePictureInPicture
      aria-hidden
    />
  )
}
