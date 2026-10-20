// Tells the front desk how much cash to collect as soon as a member opens the
// kiosk's cash screen (decided Oct 20, 2026), so staff know the amount even if
// the member walks to the desk without tapping "Confirmar pedido". A second
// message says not to collect it when the member taps "Cancelar".
//
// The route is reachable with the kiosk's public key, so it only acts on an
// open cart (not yet an order) in one of the key's sales channels, with items.
// `attempt` comes from the kiosk, one per opening of the cash screen, so
// opening it again after "Cancelar" posts again while a repeated call doesn't.

export type CartForCashCollect = {
  id: string
  total: number | string
  sales_channel_id?: string | null
  completed_at?: string | Date | null
  items?: { title?: string | null; product_title?: string | null; quantity: number }[] | null
}

export type CashCollectPlan =
  | { action: "refuse" }
  | {
      action: "notify"
      template: "cash-collect" | "cash-collect-cancelled"
      data: { total: number; items: { title: string; quantity: number }[] }
      idempotencyKey: string
    }

export function planCashCollect(
  cart: CartForCashCollect | undefined,
  salesChannelIds: string[],
  input: { attempt?: unknown; cancelled?: unknown }
): CashCollectPlan {
  const attempt = typeof input.attempt === "string" || typeof input.attempt === "number" ? String(input.attempt) : ""
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(attempt)) return { action: "refuse" }
  if (!cart || !cart.sales_channel_id || !salesChannelIds.includes(cart.sales_channel_id)) return { action: "refuse" }
  if (cart.completed_at || !(cart.items ?? []).length) return { action: "refuse" }
  const cancelled = input.cancelled === true
  const template = cancelled ? "cash-collect-cancelled" : "cash-collect"
  return {
    action: "notify",
    template,
    data: {
      total: Number(cart.total),
      items: (cart.items ?? []).map((i) => ({ title: i.product_title ?? i.title ?? "", quantity: Number(i.quantity) })),
    },
    idempotencyKey: `slack:${template}:${cart.id}:${attempt}`,
  }
}
