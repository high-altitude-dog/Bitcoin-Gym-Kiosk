import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createOrderFulfillmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import { awaitsCashPayment, paymentsOf } from "./cash-payment"
import { planFulfillment, type OrderLine } from "./fulfillment-mode"
import { notifySlack } from "./notify-slack"

type Options = {
  // Send the staff and café Slack messages. Off for the backfill of old
  // orders, which were all self-serve and need no one to act.
  notify: boolean
}

export type FulfillResult = { autoFulfilled: number; staff: number; cafe: number }

// Self-serve lines are fulfilled and marked delivered at once (the member
// has already taken the item); this is also what makes Medusa lower the
// stocked quantity, which a sale alone only reserves. Staff and café lines
// stay "Not fulfilled" until someone marks them delivered in the admin, and
// the people who hand them over get a Slack message.
export async function fulfillOrderByType(
  container: MedusaContainer,
  orderId: string,
  { notify }: Options
): Promise<FulfillResult> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      // "items.*", not "items.quantity": in Medusa 2.21.2, asking for
      // items.quantity together with a detail field drops quantity.
      "items.*",
      "items.detail.fulfilled_quantity",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.canceled_at",
    ],
    filters: { id: orderId },
  })
  const order = data[0] as any
  if (!order || order.status === "canceled") return { autoFulfilled: 0, staff: 0, cafe: 0 }
  // Unpaid cash: runs again once staff capture the payment.
  if (awaitsCashPayment(paymentsOf(order))) return { autoFulfilled: 0, staff: 0, cafe: 0 }

  const lines: OrderLine[] = (order.items ?? []).map((i: any) => ({
    id: i.id,
    title: i.product_title || i.title,
    quantity: Number(i.quantity),
    fulfilled_quantity: Number(i.detail?.fulfilled_quantity ?? 0),
    product_type: i.product_type,
  }))
  const plan = planFulfillment(lines)

  if (plan.auto.length) {
    const { result: fulfillment } = await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: order.id,
        items: plan.auto.map(({ id, quantity }) => ({ id, quantity })),
        no_notification: true,
      },
    })
    await markOrderFulfillmentAsDeliveredWorkflow(container).run({
      input: { orderId: order.id, fulfillmentId: fulfillment.id },
    })
  }

  if (notify) {
    const backendUrl = process.env.MEDUSA_BACKEND_URL?.replace(/\/+$/, "")
    const items = (lines: typeof plan.staff) => lines.map(({ title, quantity }) => ({ title, quantity }))
    if (plan.staff.length) {
      await notifySlack(container, {
        destination: "staff",
        template: "staff-order",
        data: {
          display_id: order.display_id,
          items: items(plan.staff),
          admin_url: backendUrl ? `${backendUrl}/app/orders/${order.id}` : null,
        },
        idempotencyKey: `slack:staff-order:${order.id}`,
        triggerType: "order.placed",
        resourceId: order.id,
        resourceType: "order",
      })
    }
    if (plan.cafe.length) {
      await notifySlack(container, {
        destination: "cafe",
        template: "cafe-order",
        data: { display_id: order.display_id, items: items(plan.cafe) },
        idempotencyKey: `slack:cafe-order:${order.id}`,
        triggerType: "order.placed",
        resourceId: order.id,
        resourceType: "order",
      })
    }
  }

  const count = (l: { quantity: number }[]) => l.reduce((s, x) => s + x.quantity, 0)
  return { autoFulfilled: count(plan.auto), staff: count(plan.staff), cafe: count(plan.cafe) }
}
