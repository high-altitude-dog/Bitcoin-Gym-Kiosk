import { CASH_PAYMENT_PROVIDER_ID } from "../modules/cash-payment/types"

export type OrderPayment = {
  provider_id?: string | null
  captured_at?: string | Date | null
  canceled_at?: string | Date | null
}

// A cash order the member hasn't paid at the front desk yet: its cash
// payment is authorized but not captured. Its fulfilment and the staff and
// café messages wait for the capture (subscribers/cash-payment-captured.ts),
// so nothing is handed over or made for an order nobody paid for.
export function awaitsCashPayment(payments: OrderPayment[]): boolean {
  return payments.some((p) => p.provider_id === CASH_PAYMENT_PROVIDER_ID && !p.captured_at && !p.canceled_at)
}

export function paymentsOf(order: { payment_collections?: { payments?: OrderPayment[] | null }[] | null }): OrderPayment[] {
  return (order.payment_collections ?? []).flatMap((pc) => pc?.payments ?? [])
}
