import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { fulfillOrderByType } from "../lib/fulfill-order"
import { CASH_PAYMENT_PROVIDER_ID } from "../modules/cash-payment/types"

// Staff clicked Capture on a cash order: the member has paid at the front
// desk. Now do what order-placed-fulfillment held back (self-serve items
// fulfilled, staff and café told). Planning skips anything already
// fulfilled, and the Slack messages have idempotency keys, so a repeat
// event changes nothing.
export default async function cashPaymentCaptured({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  try {
    const { data: payments } = await query.graph({
      entity: "payment",
      fields: ["id", "provider_id", "payment_collection_id"],
      filters: { id: data.id },
    })
    const payment = payments[0] as any
    if (!payment || payment.provider_id !== CASH_PAYMENT_PROVIDER_ID) return

    const { data: links } = await query.graph({
      entity: "order_payment_collection",
      fields: ["order_id"],
      filters: { payment_collection_id: payment.payment_collection_id },
    })
    const orderId = (links[0] as any)?.order_id as string | undefined
    if (!orderId) return
    await fulfillOrderByType(container, orderId, { notify: true })
  } catch (e) {
    logger.warn(`cash-payment-captured: payment ${data.id}'s order was not fulfilled automatically: ${(e as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: "payment.captured",
}
