import type { HttpTypes } from "@medusajs/types"
import type { KioskCart, KioskLine, KioskProduct } from "./kioskTypes"

/**
 * Maps the real Medusa StoreProduct/StoreCart (already fetched by useKiosk.ts) onto the
 * display-only shapes the ported kit components expect. Mirrors the stock/price logic that
 * was already live in the old ProductGrid.tsx, not the kit's own (unused) backend/medusa.ts.
 */
export function toKioskProduct(product: HttpTypes.StoreProduct): KioskProduct | null {
  const variant = product.variants?.[0]
  if (!variant) return null
  // A product with no price at all (the admin let it be published without
  // one) can't be added to a cart, and used to show as "Bs 0" with a working +.
  // Hide it until a price is set. A price of exactly 0 is a price and shows.
  const price = variant.calculated_price?.calculated_amount
  if (price === null || price === undefined) return null
  const stock = variant.inventory_quantity ?? 0
  return {
    id: product.id,
    variantId: variant.id,
    title: product.title ?? "",
    thumbnail: product.thumbnail ?? product.images?.[0]?.url ?? null,
    price,
    soldOut: stock <= 0,
    stock,
  }
}

export function cartQuantity(cart: HttpTypes.StoreCart | null, variantId: string): number {
  return cart?.items?.find((i) => i.variant_id === variantId)?.quantity ?? 0
}

/** What the member sees: the quantity they tapped in if Medusa hasn't confirmed it yet, else the cart's. */
export function shownQuantity(
  cart: HttpTypes.StoreCart | null,
  pending: Record<string, number>,
  variantId: string
): number {
  return pending[variantId] ?? cartQuantity(cart, variantId)
}

/**
 * The order bar's count and total, including taps Medusa hasn't confirmed yet: the cart's own
 * total plus the price of each unconfirmed change, so it matches the cart exactly once synced.
 */
export function toKioskCart(
  cart: HttpTypes.StoreCart | null,
  pending: Record<string, number>,
  products: KioskProduct[]
): KioskCart {
  let itemCount = (cart?.items ?? []).reduce((sum, item) => sum + item.quantity, 0)
  let total = cart?.total ?? 0
  for (const [variantId, quantity] of Object.entries(pending)) {
    const delta = quantity - cartQuantity(cart, variantId)
    const price = products.find((p) => p.variantId === variantId)?.price ?? 0
    itemCount += delta
    total += delta * price
  }
  return { id: cart?.id ?? null, total, itemCount }
}

/**
 * The order panel's lines: every product with a quantity in the order, using the same shown quantity as the
 * cards (taps Medusa hasn't confirmed yet included), so a tap appears in the panel and on the card at once.
 */
export function toKioskLines(
  cart: HttpTypes.StoreCart | null,
  pending: Record<string, number>,
  products: KioskProduct[]
): KioskLine[] {
  return products
    .map((p) => ({ ...p, qty: shownQuantity(cart, pending, p.variantId) }))
    .filter((line) => line.qty > 0)
}
