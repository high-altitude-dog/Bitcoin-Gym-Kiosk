import { createContext, useContext, useMemo, useSyncExternalStore } from "react"
import { KIOSK, type Orientation } from "../lib/stageConfig"

export interface StageGeometry {
  orientation: Orientation
  width: number
  height: number
  scale: number
  x: number
  y: number
}

/** The viewport's size as one string, so a change of either side is one change. */
function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange)
  window.addEventListener("orientationchange", onChange)
  return () => {
    window.removeEventListener("resize", onChange)
    window.removeEventListener("orientationchange", onChange)
  }
}
const viewportKey = () => `${window.innerWidth}x${window.innerHeight}`

/** Which stage fits a viewport of this size, and how to scale and centre it. */
export function stageFor(viewportWidth: number, viewportHeight: number): StageGeometry {
  // Wider than tall is landscape. The kiosk follows the shape of the screen,
  // not the OS orientation lock, so it is right however the tablet is held.
  const orientation: Orientation = viewportWidth > viewportHeight ? "landscape" : "portrait"
  const { width, height } = KIOSK.stage[orientation]
  const scale = Math.min(viewportWidth / width, viewportHeight / height)
  return {
    orientation,
    width,
    height,
    scale,
    x: (viewportWidth - width * scale) / 2,
    y: (viewportHeight - height * scale) / 2,
  }
}

/**
 * The stage for the current viewport: orientation, size, scale and offset,
 * all from one reading of the window, so a rotation changes them in a single
 * render. Orientation, scale and layout can therefore never disagree for a
 * frame (a landscape layout drawn at the portrait scale, say).
 */
export function useStage(): StageGeometry {
  const key = useSyncExternalStore(subscribe, viewportKey, () => "1200x1920")
  return useMemo(() => {
    const [w, h] = key.split("x").map(Number)
    return stageFor(w, h)
  }, [key])
}

/** The orientation of the stage around this component. */
export const OrientationContext = createContext<Orientation>("portrait")
export const useOrientation = () => useContext(OrientationContext)
