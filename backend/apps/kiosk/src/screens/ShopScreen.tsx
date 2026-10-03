import { useMemo, useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { useClock } from "../hooks/useClock"
import { t } from "../lib/strings"
import { toKioskCart, toKioskProduct } from "../lib/kioskMapping"
import { CategoryChips } from "./CategoryChips"
import { OrderBar } from "./OrderBar"
import { ProductCard } from "./ProductCard"

interface Props {
  products: HttpTypes.StoreProduct[]
  categories: HttpTypes.StoreProductCategory[]
  cart: HttpTypes.StoreCart | null
  onAdd: (variantId: string) => void
  onSetQuantity: (lineItemId: string, quantity: number) => void
  onPay: () => void
}

export function ShopScreen({ products, categories, cart, onAdd, onSetQuantity, onPay }: Props) {
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

  const kioskCategories = categories.map((c) => ({ id: c.id, name: c.name }))
  const kioskCart = toKioskCart(cart)

  function qtyOf(variantId: string): number {
    return cart?.items?.find((i) => i.variant_id === variantId)?.quantity ?? 0
  }

  function adjustQuantity(variantId: string, nextQty: number) {
    const line = cart?.items?.find((i) => i.variant_id === variantId)
    if (!line) {
      if (nextQty > 0) onAdd(variantId)
      return
    }
    onSetQuantity(line.id, nextQty)
  }

  return (
    <>
      <header className="k-header">
        <h1 className="k-title">{t.title}</h1>
        <time className="k-clock">{clock}</time>
      </header>
      <CategoryChips categories={kioskCategories} value={categoryId} onChange={setCategoryId} />
      <section className="k-grid">
        {visible.length === 0 ? (
          <p className="k-grid__message">{t.emptyCategory}</p>
        ) : (
          visible.map((p) => (
            <ProductCard key={p.id} product={p} qty={qtyOf(p.variantId)} onQty={(n) => adjustQuantity(p.variantId, n)} />
          ))
        )}
      </section>
      <OrderBar itemCount={kioskCart?.itemCount ?? 0} total={kioskCart?.total ?? 0} busy={false} onPay={onPay} />
    </>
  )
}
