import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"

// The admin's price grid has two boxes for the same price: "Price BOB" (a
// plain BOB price) and "Price Bolivia" (the same amount tied to the Bolivia
// region). When both exist the region one wins at the kiosk, so editing the
// other box would be ignored without a word. Staff can fill either box; this
// keeps one plain BOB price per variant:
//   only a region price      → becomes the plain BOB price
//   both                     → the one edited last is kept, as the plain price
//   only a plain BOB price   → nothing to do
// Variants with any other kind of price (another currency, other rules, a
// Price List sale price or a quantity tier) are left alone.

export type PriceRow = {
  id: string
  currency_code: string
  amount: number
  updated_at: string | Date | null
  // Set on a sale price from a Price List, or on a quantity-tier price.
  price_list_id?: string | null
  min_quantity?: number | null
  max_quantity?: number | null
  rules: { attribute: string; value: string }[]
}

/** The single BOB amount a variant's prices should collapse to, or null when they should be left as they are. */
export function planPriceNormalization(prices: PriceRow[]): number | null {
  if (!prices.length) return null
  // Sale prices (Price Lists) and quantity tiers are separate prices that must
  // coexist with the base price; a variant that has any is left entirely alone.
  if (prices.some((p) => p.price_list_id || p.min_quantity != null || p.max_quantity != null)) return null
  const isPlain = (p: PriceRow) => p.rules.length === 0
  const isRegion = (p: PriceRow) => p.rules.length === 1 && p.rules[0].attribute === "region_id"
  if (!prices.every((p) => p.currency_code === "bob" && (isPlain(p) || isRegion(p)))) return null
  if (prices.length === 1 && isPlain(prices[0])) return null
  const time = (p: PriceRow) => (p.updated_at ? new Date(p.updated_at).getTime() : 0)
  const newest = [...prices].sort((a, b) => time(b) - time(a))[0]
  return Number(newest.amount)
}

/** Normalizes the prices of the given variants, or of all variants of the given product(s). Returns how many variants changed. */
export async function normalizePrices(
  container: MedusaContainer,
  target: { variantIds?: string[]; productIds?: string[] }
): Promise<number> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const filters = target.variantIds ? { id: target.variantIds } : target.productIds ? { product_id: target.productIds } : {}

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "price_set.prices.id",
      "price_set.prices.amount",
      "price_set.prices.currency_code",
      "price_set.prices.updated_at",
      "price_set.prices.price_list_id",
      "price_set.prices.min_quantity",
      "price_set.prices.max_quantity",
      "price_set.prices.price_rules.attribute",
      "price_set.prices.price_rules.value",
    ],
    filters,
  })

  let changed = 0
  for (const v of variants as any[]) {
    const prices: PriceRow[] = (v.price_set?.prices ?? []).map((p: any) => ({
      id: p.id,
      currency_code: p.currency_code,
      amount: Number(p.amount),
      updated_at: p.updated_at,
      price_list_id: p.price_list_id,
      min_quantity: p.min_quantity,
      max_quantity: p.max_quantity,
      rules: (p.price_rules ?? []).map((r: any) => ({ attribute: r.attribute, value: r.value })),
    }))
    const amount = planPriceNormalization(prices)
    if (amount === null) continue
    try {
      await updateProductVariantsWorkflow(container).run({
        input: { selector: { id: v.id }, update: { prices: [{ currency_code: "bob", amount }] } },
      })
      changed++
    } catch (e) {
      logger.warn(`price-normalize: couldn't update variant ${v.id}: ${(e as Error).message}`)
    }
  }
  return changed
}
