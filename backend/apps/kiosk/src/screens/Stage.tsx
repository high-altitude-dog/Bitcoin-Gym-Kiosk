import { useEffect, type ReactNode } from "react"
import { KIOSK } from "../lib/stageConfig"
import { useStageScale } from "../hooks/useStageScale"

/** Fixed 1200x1920 design stage, scaled to fit the screen. variant picks the wall image. */
export function Stage({ variant, children }: { variant: "idle" | "shop"; children: ReactNode }) {
  const { scale, x, y } = useStageScale()
  const wall = KIOSK.wall[variant]
  useEffect(() => {
    // warm the cache for both walls so switching screens never flashes
    const dpr = window.devicePixelRatio || 1
    Object.values(KIOSK.wall).forEach((w) => { new Image().src = dpr > 1 ? w.x2 : w.x1 })
  }, [])
  return (
    <div className="k-viewport">
      <div
        className={`k-stage k-stage--${variant}`}
        style={{
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
          backgroundImage: `image-set(url("${wall.x1}") 1x, url("${wall.x2}") 2x)`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
