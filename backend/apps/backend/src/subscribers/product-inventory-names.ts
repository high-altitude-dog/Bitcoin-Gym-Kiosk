import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { syncInventoryNames } from "../lib/inventory-naming"

// Names new products' inventory items after the product (see
// lib/inventory-naming.ts), however the product was added: admin, Admin API
// or a script. Also runs on updates: a variant added to an existing product
// (so a product that gains a second variant gets "Product / Variant" names),
// and ticking "Manage inventory" later, which creates the inventory item then.
// The rule only changes names it generated, so running it often is harmless.
// Runs after the product is saved, so a failure here never blocks saving it.
export default async function productInventoryNames({
  event: { name, data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    let productId = data.id
    if (name.startsWith("product-variant.")) {
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: variants } = await query.graph({
        entity: "product_variant",
        fields: ["product_id"],
        filters: { id: data.id },
      })
      productId = variants[0]?.product_id ?? ""
      if (!productId) return
    }
    await syncInventoryNames(container, [productId])
  } catch (e) {
    logger.warn(`product-inventory-names: ${name} ${data.id}: ${(e as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product-variant.created", "product-variant.updated"],
}
