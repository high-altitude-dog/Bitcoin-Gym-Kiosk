import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { useClock } from "../hooks/useClock"
import { t } from "../lib/strings"
import { shownQuantity, toKioskCart, toKioskProduct } from "../lib/kioskMapping"
import { CategoryChips } from "./CategoryChips"
import { OrderBar } from "./OrderBar"
import { ProductCard } from "./ProductCard"

interface Props {
  products: HttpTypes.StoreProduct[]
  categories: HttpTypes.StoreProductCategory[]
  cart: HttpTypes.StoreCart | null
  pending: Record<string, number>
  onSetQuantity: (variantId: string, quantity: number) => void
  onPay: () => void
}

export function ShopScreen({ products, categories, cart, pending, onSetQuantity, onPay }: Props) {
  const clock = useClock()
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

  // Show a "more below" cue while the grid has rows out of sight, so a member
  // knows to swipe. Re-checked on scroll, on resize, and when the list changes.
  const gridRef = useRef<HTMLElement>(null)
  const [moreBelow, setMoreBelow] = useState(false)
  const checkMore = useCallback(() => {
    const el = gridRef.current
    setMoreBelow(!!el && el.scrollTop + el.clientHeight < el.scrollHeight - 8)
  }, [])
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
        <h1 className="k-title">{t.title}</h1>
        <time className="k-clock">{clock}</time>
      </header>
      <CategoryChips categories={kioskCategories} value={categoryId} onChange={setCategoryId} />
      <section className="k-grid" ref={gridRef} onScroll={checkMore}>
        {visible.length === 0 ? (
          <p className="k-grid__message">{t.emptyCategory}</p>
        ) : (
          visible.map((p) => (
            <ProductCard key={p.id} product={p} qty={shownQuantity(cart, pending, p.variantId)} onQty={(n) => onSetQuantity(p.variantId, n)} />
          ))
        )}
      </section>
      {moreBelow && <div className="k-grid-more" aria-hidden="true">{t.moreBelow}</div>}
      <OrderBar itemCount={kioskCart.itemCount} total={kioskCart.total} busy={false} onPay={onPay} />
    </>
  )
}
