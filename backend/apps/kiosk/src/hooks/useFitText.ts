import { useLayoutEffect, useRef } from "react"

/** Shrinks font-size until `text` fits on one line, down to `minPx`. */
export function useFitText<T extends HTMLElement>(text: string, maxPx: number, minPx: number) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let size = maxPx
    el.style.fontSize = `${size}px`
    while (el.scrollWidth > el.clientWidth && size > minPx) {
      size -= 1
      el.style.fontSize = `${size}px`
    }
  }, [text, maxPx, minPx])
  return ref
}
