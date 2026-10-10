import { useLayoutEffect, useRef } from "react"

/**
 * Shrinks font-size until `text` fits on one line, down to `minPx`. Fits again
 * whenever the element's width changes (the cards are a different width in
 * each orientation), not only when the text does.
 */
export function useFitText<T extends HTMLElement>(text: string, maxPx: number, minPx: number) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      let size = maxPx
      el.style.fontSize = `${size}px`
      while (el.scrollWidth > el.clientWidth && size > minPx) {
        size -= 1
        el.style.fontSize = `${size}px`
      }
    }
    fit()
    if (typeof ResizeObserver === "undefined") return
    // Only the width matters; fitting changes the font size, never the width.
    let lastWidth = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return
      lastWidth = el.clientWidth
      fit()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, maxPx, minPx])
  return ref
}
