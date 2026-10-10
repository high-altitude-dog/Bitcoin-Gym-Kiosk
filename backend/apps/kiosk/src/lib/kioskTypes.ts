/** Display-only shapes for the new dark kiosk UI. Mapped from Medusa's StoreProduct/StoreCart in kioskMapping.ts. */
export type KioskCategory = { id: string; name: string }

export type KioskProduct = {
  id: string
  variantId: string // kiosk items are single-variant; the first variant is used
  title: string
  thumbnail: string | null
  price: number // major units, region currency
  soldOut: boolean
  stock: number // units available now; the "+" button stops here
}

export type KioskCart = { id: string | null; total: number; itemCount: number }

/** A product in the order, with the quantity shown (see toKioskLines). */
export type KioskLine = KioskProduct & { qty: number }
