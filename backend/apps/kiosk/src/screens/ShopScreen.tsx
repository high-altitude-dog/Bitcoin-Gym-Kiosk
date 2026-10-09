import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { t } from "../lib/strings"
import { useGreeting } from "../hooks/useGreeting"
import { shownQuantity, toKioskCart, toKioskProduct } from "../lib/kioskMapping"
import { CategoryChips } from "./CategoryChips"
import { OrderBar } from "./OrderBar"
import { ProductCard } from "./ProductCard"

// Height of the fade-to-dark strip at an edge with more rows behind it. About
// the peek (a quarter row) plus the gap, so mid-list it covers the slice of
// the next row and no more.
const FADE_PX = 130

interface Props {
  products: HttpTypes.StoreProduct[]
  categories: HttpTypes.StoreProductCategory[]
  cart: HttpTypes.StoreCart | null
  pending: Record<string, number>
  onSetQuantity: (variantId: string, quantity: number) => void
  onPay: () => void
}

export function ShopScreen({ products, categories, cart, pending, onSetQuantity, onPay }: Props) {
  const greeting = useGreeting()
  const [categoryId, setCategoryId] = useState<string | null>(null)

  const visible = useMemo(() => {
    const kioskProducts = products.map(toKioskProduct).filter((p) => p !== null)
    if (categoryId === null) return kioskProducts
    const idsInCategory = new Set(
      products
        .filter((p) => p.categories?.some((c) => c.id === categoryId))
        .map((p) => p.id)
    )
    return kioskProducts.filter((p) => idsInCategory.has(p.id))
  }, [products, categoryId])

  // While rows are out of sight, the grid fades out at that edge, showing a
  // slice of the next row, and a chevron button sits in the faded strip.
  // Re-checked on scroll, on resize, and when the list changes.
  const gridRef = useRef<HTMLElement>(null)
  const fadeTopRef = useRef<HTMLDivElement>(null)
  const fadeBottomRef = useRef<HTMLDivElement>(null)
  const [moreBelow, setMoreBelow] = useState(false)
  const [moreAbove, setMoreAbove] = useState(false)
  const checkMore = useCallback(() => {
    const el = gridRef.current
    if (!el) return
    const viewTop = el.scrollTop
    const viewBottom = viewTop + el.clientHeight
    const above = viewTop > 8
    const below = viewBottom < el.scrollHeight - 8
    setMoreAbove(above)
    setMoreBelow(below)
    // The fade is a fixed-size strip at each open edge that shrinks only when
    // less than that much content is left to scroll (so it eases away at the
    // very top/bottom). It depends smoothly on the scroll position: an earlier
    // version sized it to "the gap below the last fully visible row", which
    // dropped from a whole row to zero the instant a new row became fully
    // visible, so that row popped from dim to bright (seen on the tablet).
    const fadeTop = Math.min(FADE_PX, viewTop)
    const fadeBottom = Math.min(FADE_PX, Math.max(0, el.scrollHeight - viewBottom))
    // Set directly rather than through state: this runs on every scroll frame.
    if (fadeTopRef.current) fadeTopRef.current.style.height = `${Math.max(0, fadeTop)}px`
    if (fadeBottomRef.current) fadeBottomRef.current.style.height = `${Math.max(0, fadeBottom)}px`
  }, [])
  // The chevrons scroll the grid by two rows.
  const scrollRows = (direction: 1 | -1) => {
    const el = gridRef.current
    if (!el) return
    const cards = el.querySelectorAll<HTMLElement>(".k-card")
    const rowPitch = cards.length > 3 ? cards[3].offsetTop - cards[0].offsetTop : 434
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.scrollBy({ top: direction * 2 * rowPitch, behavior: calm ? "auto" : "smooth" })
  }
  useEffect(() => {
    checkMore()
    const el = gridRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(checkMore)
    observer.observe(el)
    return () => observer.disconnect()
  }, [checkMore, visible])

  const kioskCategories = categories.map((c) => ({ id: c.id, name: c.name }))
  const allProducts = useMemo(() => products.map(toKioskProduct).filter((p) => p !== null), [products])
  const kioskCart = toKioskCart(cart, pending, allProducts)

  return (
    <>
      <header className="k-header">
        <h1 className="k-title">{greeting}</h1>
      </header>
      <CategoryChips categories={kioskCategories} value={categoryId} onChange={setCategoryId} />
      <section
        className="k-grid"
        ref={gridRef}
        onScroll={checkMore}
      >
        {visible.length === 0 ? (
          <p className="k-grid__message">{t.emptyCategory}</p>
        ) : (
          visible.map((p) => (
            <ProductCard key={p.id} product={p} qty={shownQuantity(cart, pending, p.variantId)} onQty={(n) => onSetQuantity(p.variantId, n)} />
          ))
        )}
      </section>
      <div className="k-grid-fade k-grid-fade--top" ref={fadeTopRef} aria-hidden />
      <div className="k-grid-fade k-grid-fade--bottom" ref={fadeBottomRef} aria-hidden />
      {moreAbove && <button className="k-scroll-cue k-scroll-cue--up" aria-label={t.moreAbove} onClick={() => scrollRows(-1)} />}
      {moreBelow && <button className="k-scroll-cue k-scroll-cue--down" aria-label={t.moreBelow} onClick={() => scrollRows(1)} />}
      <OrderBar itemCount={kioskCart.itemCount} total={kioskCart.total} busy={false} onPay={onPay} />
    </>
  )
}
