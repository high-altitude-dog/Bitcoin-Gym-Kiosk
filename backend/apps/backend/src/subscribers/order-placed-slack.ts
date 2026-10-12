import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, getVariantAvailability } from "@medusajs/framework/utils"
import { notifySlack } from "../lib/notify-slack"
import { COINOS_LIGHTNING_PROVIDER_ID } from "../modules/coinos-lightning/types"
import { CASH_PAYMENT_PROVIDER_ID } from "../modules/cash-payment/types"

// Items at or below this many units left are reported after a sale.
export const LOW_STOCK_THRESHOLD = 3

// Posts each kiosk sale to Slack, plus a low-stock alert when the sale
// leaves any of its products nearly sold out. Runs after the order is saved,
// so a Slack problem can never affect the sale itself.
export default async function orderPlacedSlack({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "total",
      "sales_channel_id",
      "items.title",
      "items.product_title",
      "items.quantity",
      "items.variant_id",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.data",
    ],
    filters: { id: data.id },
  })
  const order = orders[0] as any
  if (!order) return

  const items = (order.items ?? []) as { title: string; product_title?: string; quantity: number; variant_id?: string }[]
  const payments = (order.payment_collections ?? []).flatMap((pc: any) => pc?.payments ?? [])
  const lightning = payments.find((p: any) => p?.provider_id === COINOS_LIGHTNING_PROVIDER_ID)
  const providers = new Set(payments.map((p: any) => p?.provider_id))
  // pp_system_default is only used by the kiosk's bank QR "Pagado" button.
  const paymentMethod = lightning
    ? "lightning"
    : providers.has(CASH_PAYMENT_PROVIDER_ID)
      ? "cash"
      : providers.has("pp_system_default")
        ? "bank_qr"
        : "other"
  const backendUrl = process.env.MEDUSA_BACKEND_URL?.replace(/\/+$/, "")

  await notifySlack(container, {
    template: "order-placed",
    data: {
      display_id: order.display_id,
      total: Number(order.total),
      items: items.map((i) => ({ title: i.product_title || i.title, quantity: Number(i.quantity) })),
      payment_method: paymentMethod,
      sats: lightning ? Number(lightning.data?.sats_amount ?? 0) || null : null,
      admin_url: backendUrl ? `${backendUrl}/app/orders/${order.id}` : null,
    },
    idempotencyKey: `slack:order-placed:${order.id}`,
    triggerType: "order.placed",
    resourceId: order.id,
    resourceType: "order",
  })

  // Same availability calculation the Store API uses for the kiosk's
  // "Agotado" label, so Slack and the tablet agree on what's left.
  const variantIds = [...new Set(items.map((i) => i.variant_id).filter((id): id is string => !!id))]
  if (!variantIds.length || !order.sales_channel_id) return
  const availability = await getVariantAvailability(query, {
    variant_ids: variantIds,
    sales_channel_id: order.sales_channel_id,
  })
  const titleOf = (id: string) => {
    const item = items.find((i) => i.variant_id === id)
    return item?.product_title || item?.title || id
  }
  const low = variantIds
    .map((id) => ({ title: titleOf(id), available: Number(availability[id]?.availability ?? 0) }))
    .filter((v) => v.available <= LOW_STOCK_THRESHOLD)
  if (!low.length) return

  await notifySlack(container, {
    template: "low-stock",
    data: { display_id: order.display_id, items: low },
    idempotencyKey: `slack:low-stock:${order.id}`,
    triggerType: "order.placed",
    resourceId: order.id,
    resourceType: "order",
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
