import { useEffect, type ReactNode } from "react"
import { KIOSK } from "../lib/stageConfig"
import { OrientationContext, useStage } from "../hooks/useStage"

/**
 * Fixed design stage (1200x1920 portrait, 1920x1200 landscape), scaled to fit
 * the screen. variant picks the wall image; "plain" (payment, done and message
 * screens) has none. The orientation is a data attribute that the stylesheet
 * reads, and a context for components that need it, so turning the tablet
 * changes the layout without remounting anything: carts, invoices, scroll
 * positions and playing videos all carry over.
 */
export function Stage({ variant, children }: { variant: "idle" | "shop" | "plain"; children: ReactNode }) {
  const { orientation, scale, x, y } = useStage()
  const wall = variant === "plain" ? null : KIOSK.wall[orientation][variant]
  useEffect(() => {
    // warm the cache for every wall, in both orientations, so switching
    // screens or turning the tablet never flashes
    const dpr = window.devicePixelRatio || 1
    Object.values(KIOSK.wall).forEach((walls) =>
      Object.values(walls).forEach((w) => { new Image().src = dpr > 1 ? w.x2 : w.x1 })
    )
  }, [])
  return (
    <OrientationContext.Provider value={orientation}>
      <div className="k-viewport">
        <div
          className={`k-stage k-stage--${variant}`}
          data-orientation={orientation}
          style={{
            transform: `translate(${x}px, ${y}px) scale(${scale})`,
            backgroundImage: wall ? `image-set(url("${wall.x1}") 1x, url("${wall.x2}") 2x)` : undefined,
          }}
        >
          {children}
        </div>
      </div>
    </OrientationContext.Provider>
  )
}
