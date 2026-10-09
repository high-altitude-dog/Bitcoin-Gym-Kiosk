import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { normalizePrices } from "../lib/price-normalize"

// Keeps one plain BOB price per variant (see lib/price-normalize.ts), whichever
// of the admin's two price boxes was filled. Runs after the save, so a failure
// never blocks it, and does nothing once a variant has a single plain price.
export default async function productPrices({ event: { name, data }, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    await normalizePrices(container, name.startsWith("product-variant.") ? { variantIds: [data.id] } : { productIds: [data.id] })
  } catch (e) {
    logger.warn(`product-prices: ${name} ${data.id}: ${(e as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product-variant.created", "product-variant.updated"],
}
