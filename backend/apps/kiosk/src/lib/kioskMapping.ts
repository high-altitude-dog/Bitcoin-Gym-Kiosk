import type { HttpTypes } from "@medusajs/types"
import type { KioskCart, KioskLine, KioskProduct } from "./kioskTypes"
import type { Lang } from "./strings"

/**
 * Maps the real Medusa StoreProduct/StoreCart (already fetched by useKiosk.ts) onto the
 * display-only shapes the ported kit components expect. Mirrors the stock/price logic that
 * was already live in the old ProductGrid.tsx, not the kit's own (unused) backend/medusa.ts.
 */
export function toKioskProduct(product: HttpTypes.StoreProduct, lang: Lang = "es"): KioskProduct | null {
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
    title: productName(product, lang),
    thumbnail: product.thumbnail ?? product.images?.[0]?.url ?? null,
    price,
    soldOut: stock <= 0,
    stock,
  }
}

/**
 * Sold-out products move to the end of the grid; everything else keeps Medusa's order. The sort is stable, so
 * the sold-out ones keep their own order too. Stock is read when the catalogue loads (each time the kiosk goes
 * back to the start screen), so the grid never reshuffles while a member is shopping.
 */
export function soldOutLast(products: KioskProduct[]): KioskProduct[] {
  return [...products].sort((a, b) => Number(a.soldOut) - Number(b.soldOut))
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

type Metadata = Record<string, unknown> | null | undefined

/**
 * A name as shown: in English, the `name_en` metadata (set by staff in the
 * admin, on the product's or category's page under Metadata) when there is one;
 * otherwise, and in Spanish, the name as entered.
 */
export function localName(name: string, metadata: Metadata, lang: Lang): string {
  const en = metadata?.name_en
  return lang === "en" && typeof en === "string" && en.trim() ? en.trim() : name
}

/** A category chip's label (see localName). */
export function categoryName(category: { name: string; metadata?: Metadata }, lang: Lang): string {
  return localName(category.name, category.metadata, lang)
}

/** A product's name on its card and in the order panel (see localName). */
export function productName(product: { title?: string | null; metadata?: Metadata }, lang: Lang): string {
  return localName(product.title ?? "", product.metadata, lang)
}

/**
 * A cart or order line's name: its product's name from the catalogue, so it is in
 * English when the product has one. A line keeps the title it was sold under
 * (`product_title`) and falls back to it when the product is no longer listed.
 */
export function lineName(
  item: { product_id?: string | null; product_title?: string | null; title?: string | null },
  products: HttpTypes.StoreProduct[],
  lang: Lang
): string {
  const product = item.product_id ? products.find((p) => p.id === item.product_id) : undefined
  if (product) return productName(product, lang)
  return item.product_title ?? item.title ?? ""
}
