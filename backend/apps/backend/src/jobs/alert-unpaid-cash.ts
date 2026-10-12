import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { notifySlack } from "../lib/notify-slack"
import { CASH_PAYMENT_PROVIDER_ID } from "../modules/cash-payment/types"

// A member walking from the kiosk to the desk takes a minute or two; past
// this, the order has probably been forgotten (or not paid on purpose).
export const UNPAID_AFTER_MINUTES = 15
// Only look this far back: older cases have already been alerted on.
const LOOKBACK_HOURS = 24

export type CashPaymentRow = {
  id: string
  payment_collection_id: string
  captured_at?: string | Date | null
  canceled_at?: string | Date | null
  created_at: string | Date
}

export type UnpaidCash = { paymentId: string; collectionId: string; minutesWaiting: number }

// Cash payments still not captured after the grace period. Pure, so it's
// unit-testable without a database.
export function findUnpaidCash(payments: CashPaymentRow[], now: number): UnpaidCash[] {
  return payments.flatMap((p) => {
    if (p.captured_at || p.canceled_at) return []
    const minutesWaiting = Math.floor((now - new Date(p.created_at).getTime()) / 60_000)
    if (minutesWaiting < UNPAID_AFTER_MINUTES) return []
    return [{ paymentId: p.id, collectionId: p.payment_collection_id, minutesWaiting }]
  })
}

// One Slack message per unpaid cash order (the idempotency key stops later
// runs repeating it). Stock stays reserved for these orders until staff
// either capture the payment or cancel the order.
export default async function alertUnpaidCash(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const now = Date.now()

  const { data: payments } = await query.graph({
    entity: "payment",
    fields: ["id", "payment_collection_id", "captured_at", "canceled_at", "created_at"],
    filters: {
      provider_id: CASH_PAYMENT_PROVIDER_ID,
      created_at: { $gte: new Date(now - LOOKBACK_HOURS * 3_600_000).toISOString() },
    },
  })
  const unpaid = findUnpaidCash(payments as CashPaymentRow[], now)
  if (!unpaid.length) return

  const { data: links } = await query.graph({
    entity: "order_payment_collection",
    fields: ["order_id", "payment_collection_id"],
    filters: { payment_collection_id: unpaid.map((u) => u.collectionId) },
  })
  const orderByCollection = new Map(links.map((l: any) => [l.payment_collection_id, l.order_id] as [string, string]))
  const orderIds = [...new Set(orderByCollection.values())]
  if (!orderIds.length) return

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "total", "status"],
    filters: { id: orderIds },
  })
  const orderById = new Map(orders.map((o: any) => [o.id as string, o]))
  const backendUrl = process.env.MEDUSA_BACKEND_URL?.replace(/\/+$/, "")

  for (const u of unpaid) {
    const order = orderById.get(orderByCollection.get(u.collectionId) ?? "") as any
    if (!order || order.status === "canceled") continue
    await notifySlack(container, {
      template: "unpaid-cash",
      data: {
        display_id: order.display_id,
        total: Number(order.total),
        minutes_waiting: u.minutesWaiting,
        admin_url: backendUrl ? `${backendUrl}/app/orders/${order.id}` : null,
      },
      idempotencyKey: `slack:unpaid-cash:${order.id}`,
      triggerType: "job:alert-unpaid-cash",
      resourceId: order.id,
      resourceType: "order",
    })
  }
}

export const config = {
  name: "alert-unpaid-cash",
  schedule: "*/5 * * * *",
}
