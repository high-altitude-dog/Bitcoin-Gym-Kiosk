import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

// Every product is sold and collected at the gym, so staff shouldn't have to
// know what a "shipping profile" or "sales channel" is. A product with no
// shipping profile fails checkout ("shipping profiles not satisfied"), and
// one with no sales channel never shows on the kiosk, so any product that
// lacks either gets the gym's own:
//   shipping profile → the default one (named after the gym)
//   sales channel    → the store's default channel (the gym's kiosk)
// Only fills what is missing. A product that already has a profile or channel
// (for example one a future second gym added) is never changed.

export type ProductForDefaults = {
  id: string
  shipping_profile: { id: string } | null
  sales_channels: { id: string }[] | null
}

export type ProductDefaultsUpdate = { id: string; shipping_profile_id?: string; sales_channel_id?: string }

export function planProductDefaults(
  products: ProductForDefaults[],
  defaults: { shippingProfileId: string | null; salesChannelId: string | null }
): ProductDefaultsUpdate[] {
  return products.flatMap((p) => {
    const update: ProductDefaultsUpdate = { id: p.id }
    if (!p.shipping_profile && defaults.shippingProfileId) update.shipping_profile_id = defaults.shippingProfileId
    if (!(p.sales_channels ?? []).length && defaults.salesChannelId) update.sales_channel_id = defaults.salesChannelId
    return update.shipping_profile_id || update.sales_channel_id ? [update] : []
  })
}

/** Fills in the missing defaults on the given products (all products when none are given). Returns how many changed. */
export async function applyProductDefaults(container: MedusaContainer, productIds?: string[]): Promise<number> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "shipping_profile.id", "sales_channels.id"],
    ...(productIds ? { filters: { id: productIds } } : {}),
  })

  const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id", "type"] })
  const { data: stores } = await query.graph({ entity: "store", fields: ["default_sales_channel_id"] })
  const defaults = {
    shippingProfileId: ((profiles as any[]).find((p) => p.type === "default") ?? profiles[0])?.id ?? null,
    salesChannelId: (stores[0] as any)?.default_sales_channel_id ?? null,
  }

  const updates = planProductDefaults(products as ProductForDefaults[], defaults)
  let changed = 0
  for (const u of updates) {
    try {
      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: u.id },
          update: {
            ...(u.shipping_profile_id ? { shipping_profile_id: u.shipping_profile_id } : {}),
            ...(u.sales_channel_id ? { sales_channels: [{ id: u.sales_channel_id }] } : {}),
          },
        },
      })
      changed++
    } catch (e) {
      logger.warn(`product-defaults: couldn't update product ${u.id}: ${(e as Error).message}`)
    }
  }
  return changed
}
