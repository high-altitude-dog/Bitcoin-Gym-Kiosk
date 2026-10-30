import type { ReactNode } from "react"
import { KIOSK } from "../lib/stageConfig"

/**
 * Byte's "magic hoops" loop (Second's mascot, used with permission) for
 * waiting moments. A muted looping WebM video rather than the GIF: under half the
 * size, and it always starts from the first frame (a cached GIF can resume
 * mid-loop). The art is unaltered; its black ground is baked in, so it sits
 * on a pure black screen. Reduced motion gets the still frame.
 */
export function ByteLoader({ label, aside }: { label: string; aside?: ReactNode }) {
  const base = `${KIOSK.assets}byte/`
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  return (
    <div className={`byte-loader${aside ? " byte-loader--aside" : ""}`} role="status" aria-label={label}>
      <div className="byte-loader__row">
      {reduceMotion ? (
        <img className="byte-loader__art" src={`${base}byte-magic-hoops-still.png`} width={606} height={326} alt="" />
      ) : (
        <video
          className="byte-loader__art"
          src={`${base}byte-magic-hoops.webm`}
          poster={`${base}byte-magic-hoops-still.png`}
          width={606}
          height={326}
          autoPlay
          loop
          muted
          playsInline
          disablePictureInPicture
          aria-hidden
        />
      )}
      {aside}
      </div>
      <p className="byte-loader__label">{label}</p>
    </div>
  )
}
