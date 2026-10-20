import { CASH_PAYMENT_PROVIDER_ID } from "../modules/cash-payment/types"
import type { OrderPayment } from "./cash-payment"

// The kiosk's cash screen counts down 5 minutes. If nobody taps "Confirmar
// pedido" or "Cancelar" in that time, the gym treats the order as paid at the
// front desk and handed over (decided Oct 20, 2026): the kiosk places the
// order, then asks the backend to capture its cash payment, which fulfils it
// like staff's Capture button would.
//
// The route doing that is reachable with the kiosk's public key, so it only
// acts on an order the kiosk has just placed: in one of the key's sales
// channels, not cancelled, placed within the last few minutes, with a cash
// payment still uncaptured.
export const CASH_AUTO_CAPTURE_WINDOW_MS = 5 * 60_000

export type OrderForAutoCapture = {
  id: string
  status: string
  sales_channel_id?: string | null
  created_at: string | Date
  payment_collections?: { payments?: (OrderPayment & { id: string })[] | null }[] | null
}

export type AutoCaptureDecision =
  | { action: "capture"; paymentId: string }
  | { action: "already-captured" }
  | { action: "refuse"; reason: string }

export function decideCashAutoCapture(
  order: OrderForAutoCapture | undefined,
  salesChannelIds: string[],
  now: number
): AutoCaptureDecision {
  if (!order || !order.sales_channel_id || !salesChannelIds.includes(order.sales_channel_id)) {
    return { action: "refuse", reason: "order not found" }
  }
  if (order.status === "canceled") return { action: "refuse", reason: "order is cancelled" }
  const cash = (order.payment_collections ?? [])
    .flatMap((pc) => pc?.payments ?? [])
    .filter((p) => p.provider_id === CASH_PAYMENT_PROVIDER_ID && !p.canceled_at)
  if (!cash.length) return { action: "refuse", reason: "not a cash order" }
  const uncaptured = cash.find((p) => !p.captured_at)
  if (!uncaptured) return { action: "already-captured" }
  if (now - new Date(order.created_at).getTime() > CASH_AUTO_CAPTURE_WINDOW_MS) {
    return { action: "refuse", reason: "order is too old to capture from the kiosk" }
  }
  return { action: "capture", paymentId: uncaptured.id }
}
