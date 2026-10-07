// How each product reaches the member, chosen per product with Medusa's own
// "Type" field in the admin. Order lines keep a snapshot of the type
// (`product_type`), so changing a product later doesn't change old orders.
export const FULFILLMENT_TYPES = {
  auto: "Autoservicio", // taken from the jars and baskets: fulfilled at once
  staff: "Entrega del personal", // handed over by staff: Slack alert, marked delivered in the admin
  cafe: "Café asociado", // made and delivered by the partner café: Slack to the café
} as const

export type FulfillmentMode = keyof typeof FULFILLMENT_TYPES

// No type, or one that isn't ours, means self-serve: that's how most of the
// kiosk sells, and it means a new product works without setting anything.
export function fulfillmentModeOf(productType: string | null | undefined): FulfillmentMode {
  const value = productType?.trim().toLowerCase()
  for (const [mode, name] of Object.entries(FULFILLMENT_TYPES) as [FulfillmentMode, string][]) {
    if (value === name.toLowerCase()) return mode
  }
  return "auto"
}

export type OrderLine = {
  id: string
  title: string
  quantity: number
  fulfilled_quantity: number
  product_type?: string | null
}

export type PlannedLine = { id: string; title: string; quantity: number }

// Splits an order's still-unfulfilled quantities by mode. Fulfilled
// quantities are skipped, so planning the same order twice (a redelivered
// event, a re-run backfill) never fulfils anything twice.
export function planFulfillment(lines: OrderLine[]): Record<FulfillmentMode, PlannedLine[]> {
  const plan: Record<FulfillmentMode, PlannedLine[]> = { auto: [], staff: [], cafe: [] }
  for (const line of lines) {
    const remaining = Number(line.quantity) - Number(line.fulfilled_quantity ?? 0)
    // A missing quantity must fail loudly, not reach the database as NaN.
    if (!Number.isFinite(remaining)) throw new Error(`order line ${line.id} has no usable quantity`)
    if (remaining <= 0) continue
    plan[fulfillmentModeOf(line.product_type)].push({ id: line.id, title: line.title, quantity: remaining })
  }
  return plan
}
