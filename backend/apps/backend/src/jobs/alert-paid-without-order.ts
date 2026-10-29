import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { notifySlack } from "../lib/notify-slack"
import { COINOS_LIGHTNING_PROVIDER_ID } from "../modules/coinos-lightning/types"
import { BARK_ARK_PROVIDER_ID } from "../modules/bark-ark/types"
import { BIP321_PROVIDER_ID } from "../modules/bip321-ark-bolt12/types"

// Give the kiosk's poll and the Coinos webhook this long to complete the
// order before calling a confirmed payment stuck. Normally it's seconds.
export const STUCK_AFTER_MINUTES = 3
// Only look this far back: older cases have already been alerted on.
const LOOKBACK_HOURS = 24

export type SessionRow = {
  id: string
  provider_id: string
  amount: number
  data: Record<string, unknown> | null
  payment_collection_id: string
  updated_at: string | Date
}

export type StuckPayment = {
  sessionId: string
  cartId: string
  amount: number
  sats: number | null
  minutesWaiting: number
  rail: string
}

// Which rail the bitcoin arrived on, and so which wallet to refund from.
// Bitcoin Ark's and BIP321's own `paid_rail` is set when the payment is
// confirmed (null after an Ark top-up); Coinos's invoice text says BOLT11 or
// BOLT12 (an offer starts with "lno").
export function paidRail(providerId: string, data: Record<string, unknown> | null): string {
  const paid = data?.paid_rail
  if (providerId === BARK_ARK_PROVIDER_ID) {
    if (paid === "ark") return "Ark (Bark Pay, botón Bitcoin Ark)"
    if (paid === "lightning") return "Lightning Bolt11 (Bark Pay, botón Bitcoin Ark)"
    return "Ark o Lightning, no se sabe cuál (Bark Pay, botón Bitcoin Ark)"
  }
  if (providerId === BIP321_PROVIDER_ID) {
    if (paid === "ark") return "Ark (Bark Pay, botón BIP321)"
    if (paid === "bolt12") return "Lightning Bolt12 (Coinos, botón BIP321)"
    return "Ark o Bolt12, no se sabe cuál (botón BIP321)"
  }
  const invoice = typeof data?.bolt11 === "string" ? data.bolt11.toLowerCase() : ""
  return invoice.startsWith("lno") ? "Lightning Bolt12 (Coinos)" : "Lightning Bolt11 (Coinos)"
}

// A confirmed Bitcoin session (Lightning, Ark or BIP321) whose cart has no order after the grace
// period. Pure, so it's unit-testable without a database.
export function findStuckPayments(
  sessions: SessionRow[],
  cartByCollection: Map<string, string>,
  cartsWithOrder: Set<string>,
  now: number
): StuckPayment[] {
  return sessions.flatMap((s) => {
    const cartId = cartByCollection.get(s.payment_collection_id)
    if (!cartId || cartsWithOrder.has(cartId)) return []
    const minutesWaiting = Math.floor((now - new Date(s.updated_at).getTime()) / 60_000)
    if (minutesWaiting < STUCK_AFTER_MINUTES) return []
    const sats = Number(s.data?.sats_amount ?? 0) || null
    return [{ sessionId: s.id, cartId, amount: Number(s.amount), sats, minutesWaiting, rail: paidRail(s.provider_id, s.data) }]
  })
}

// The kiosk shows "call staff" for this case, but only on the tablet. This
// puts it in Slack too, once per payment session (the idempotency key keeps
// later runs of this job from repeating it).
export default async function alertPaidWithoutOrder(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const now = Date.now()

  const { data: sessions } = await query.graph({
    entity: "payment_session",
    fields: ["id", "provider_id", "amount", "data", "payment_collection_id", "updated_at"],
    filters: {
      // Every method the kiosk waits on: Coinos Lightning, Bitcoin Ark and BIP321.
      provider_id: [COINOS_LIGHTNING_PROVIDER_ID, BARK_ARK_PROVIDER_ID, BIP321_PROVIDER_ID],
      status: ["authorized", "captured"],
      updated_at: { $gte: new Date(now - LOOKBACK_HOURS * 3_600_000).toISOString() },
    },
  })
  if (!sessions.length) return

  const { data: links } = await query.graph({
    entity: "cart_payment_collection",
    fields: ["cart_id", "payment_collection_id"],
    filters: { payment_collection_id: sessions.map((s: any) => s.payment_collection_id) },
  })
  const cartByCollection = new Map(links.map((l: any) => [l.payment_collection_id, l.cart_id] as [string, string]))
  const cartIds = [...cartByCollection.values()]
  if (!cartIds.length) return

  const { data: orderCarts } = await query.graph({
    entity: "order_cart",
    fields: ["cart_id", "order_id"],
    filters: { cart_id: cartIds },
  })
  const cartsWithOrder = new Set(orderCarts.map((o: any) => o.cart_id as string))

  for (const stuck of findStuckPayments(sessions as SessionRow[], cartByCollection, cartsWithOrder, now)) {
    await notifySlack(container, {
      template: "paid-without-order",
      data: {
        cart_id: stuck.cartId,
        amount: stuck.amount,
        sats: stuck.sats,
        minutes_waiting: stuck.minutesWaiting,
        rail: stuck.rail,
      },
      idempotencyKey: `slack:paid-without-order:${stuck.sessionId}`,
      triggerType: "job:alert-paid-without-order",
      resourceId: stuck.cartId,
      resourceType: "cart",
    })
  }
}

export const config = {
  name: "alert-paid-without-order",
  schedule: "*/5 * * * *",
}
