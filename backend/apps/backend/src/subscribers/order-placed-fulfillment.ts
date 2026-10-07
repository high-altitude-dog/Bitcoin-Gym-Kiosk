import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { fulfillOrderByType } from "../lib/fulfill-order"

// Fulfils each new order by its products' Type (see lib/fulfillment-mode.ts):
// self-serve items at once, staff and café items by Slack. Runs after the
// order is saved, so a failure here never affects the sale; staff can still
// fulfil by hand in the admin.
export default async function orderPlacedFulfillment({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    await fulfillOrderByType(container, data.id, { notify: true })
  } catch (e) {
    logger.warn(`order-placed-fulfillment: order ${data.id} was not fulfilled automatically: ${(e as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
