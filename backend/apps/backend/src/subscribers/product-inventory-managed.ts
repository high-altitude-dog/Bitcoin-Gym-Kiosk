import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { enableInventoryManagement } from "../lib/inventory-managed"

// Switches "Manage inventory" on for new variants (see lib/inventory-managed.ts),
// however they were added. Creation events only, so unticking it later sticks.
// Runs after the product is saved, so a failure never blocks creating it.
export default async function productInventoryManaged({
  event: { name, data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    await enableInventoryManagement(
      container,
      name === "product-variant.created" ? { variantId: data.id } : { productId: data.id }
    )
  } catch (e) {
    logger.warn(`product-inventory-managed: ${name} ${data.id}: ${(e as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product-variant.created"],
}
