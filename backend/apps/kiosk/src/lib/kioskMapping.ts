import type { HttpTypes } from "@medusajs/types"
import type { KioskCart, KioskProduct } from "./kioskTypes"

/**
 * Maps the real Medusa StoreProduct/StoreCart (already fetched by useKiosk.ts) onto the
 * display-only shapes the ported kit components expect. Mirrors the stock/price logic that
 * was already live in the old ProductGrid.tsx, not the kit's own (unused) backend/medusa.ts.
 */
export function toKioskProduct(product: HttpTypes.StoreProduct): KioskProduct | null {
  const variant = product.variants?.[0]
  if (!variant) return null
  const stock = variant.inventory_quantity ?? 0
  return {
    id: product.id,
    variantId: variant.id,
    title: product.title ?? "",
    thumbnail: product.thumbnail ?? product.images?.[0]?.url ?? null,
    price: variant.calculated_price?.calculated_amount ?? 0,
    soldOut: stock <= 0,
  }
}

export function toKioskCart(cart: HttpTypes.StoreCart | null): KioskCart | null {
  if (!cart) return null
  const itemCount = (cart.items ?? []).reduce((sum, item) => sum + item.quantity, 0)
  return { id: cart.id, total: cart.total ?? 0, itemCount }
}
