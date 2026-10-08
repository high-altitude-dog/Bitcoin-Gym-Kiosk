import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { applyProductDefaults } from "../lib/product-defaults"

// Gives a new product the gym's shipping profile and sales channel when it
// has none (see lib/product-defaults.ts), however it was added: admin, Admin
// API or a script. Runs after the product is saved, so a failure here never
// blocks saving it. Also runs on updates, so clearing either field can't
// leave a product that fails checkout or is hidden from the kiosk; when
// nothing is missing it changes nothing, so it doesn't loop.
export default async function productDefaults({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    await applyProductDefaults(container, [data.id])
  } catch (e) {
    logger.warn(`product-defaults: product ${data.id}: ${(e as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated"],
}
