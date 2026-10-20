import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { t } from "../lib/strings"
import { useGreeting } from "../hooks/useGreeting"
import { useOrientation } from "../hooks/useStage"
import { shownQuantity, soldOutLast, toKioskCart, toKioskLines, toKioskProduct } from "../lib/kioskMapping"
import { CategoryChips } from "./CategoryChips"
import { OrderBar } from "./OrderBar"
import { OrderPanel } from "./OrderPanel"
import { ProductCard } from "./ProductCard"

// Height of the fade-to-dark strip at an edge with more rows behind it. About
// the peek (a quarter row) plus the gap, so mid-list it covers the slice of
// the next row and no more.
const FADE_PX = 130

// After turning the tablet, the scrolling the turn itself causes must not
// change which product is remembered as the one in view. Otherwise each
// round trip would move the list a little closer to the top.
const ANCHOR_QUIET_MS = 400

/** How far a row snaps below the top of the grid (room for the slice of the row above). */
function snapPadding(grid: HTMLElement): number {
  return parseFloat(getComputedStyle(grid).scrollPaddingTop) || 0
}

/**
 * The distance from one row of cards to the next. Found from the cards
 * themselves, not from a column count: the first card that sits lower than the
 * first one starts the second row, whatever the number of columns.
 */
function rowPitchOf(cards: ArrayLike<HTMLElement>): number {
  const firstTop = cards[0]?.offsetTop ?? 0
  for (let i = 1; i < cards.length; i++) {
    if (cards[i].offsetTop > firstTop) return cards[i].offsetTop - firstTop
  }
  return 434
}

interface Props {
  products: HttpTypes.StoreProduct[]
  categories: HttpTypes.StoreProductCategory[]
  cart: HttpTypes.StoreCart | null
  pending: Record<string, number>
  onSetQuantity: (variantId: string, quantity: number) => void
  onPay: () => void
  // The small, faint button at the top right: back to "Toca para empezar", cart cleared.
  onExit: () => void
}

export function ShopScreen({ products, categories, cart, pending, onSetQuantity, onPay, onExit }: Props) {
  const greeting = useGreeting()
  const [categoryId, setCategoryId] = useState<string | null>(null)

  const visible = useMemo(() => {
    const kioskProducts = soldOutLast(products.map(toKioskProduct).filter((p) => p !== null))
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
    // The first product in view: the first card at or below the snap line
    // (the row above it only shows as a slice).
    const cards = el.querySelectorAll<HTMLElement>(".k-card")
    const snapLine = viewTop - snapPadding(el) + 1
    const first = Array.from(cards).findIndex((card) => card.offsetTop >= snapLine)
    if (performance.now() - restoredAt.current > ANCHOR_QUIET_MS) anchorIndex.current = Math.max(0, first)
    // Set directly rather than through state: this runs on every scroll frame.
    if (fadeTopRef.current) fadeTopRef.current.style.height = `${Math.max(0, fadeTop)}px`
    if (fadeBottomRef.current) fadeBottomRef.current.style.height = `${Math.max(0, fadeBottom)}px`
  }, [])
  // The chevrons scroll the grid by two rows.
  const scrollRows = (direction: 1 | -1) => {
    const el = gridRef.current
    if (!el) return
    const cards = el.querySelectorAll<HTMLElement>(".k-card")
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.scrollBy({ top: direction * 2 * rowPitchOf(cards), behavior: calm ? "auto" : "smooth" })
  }
  // Turning the tablet changes the number of columns, and so which row each
  // product is in. Remember the first product in view while scrolling, and
  // after a turn scroll to the row that now holds it, so the member keeps their
  // place in the list.
  const orientation = useOrientation()
  const lastOrientation = useRef(orientation)
  const anchorIndex = useRef(0)
  const restoredAt = useRef(-Infinity)
  useLayoutEffect(() => {
    if (lastOrientation.current === orientation) return
    lastOrientation.current = orientation
    const el = gridRef.current
    if (!el) return
    const card = el.querySelectorAll<HTMLElement>(".k-card")[anchorIndex.current]
    el.scrollTop = card ? Math.max(0, card.offsetTop - snapPadding(el)) : 0
    restoredAt.current = performance.now()
    checkMore()
  }, [orientation, checkMore])
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
  const lines = toKioskLines(cart, pending, allProducts)

  return (
    <>
      <header className="k-header">
        <h1 className="k-title">{greeting}</h1>
        {/* Deliberately small and faint: for staff, not a member's next step. */}
        <button className="k-exit" onClick={onExit} aria-label={t.backToStart} />
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
      <OrderPanel lines={lines} itemCount={kioskCart.itemCount} total={kioskCart.total} busy={false} onQty={onSetQuantity} onPay={onPay} />
    </>
  )
}
