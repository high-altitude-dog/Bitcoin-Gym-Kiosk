// The provider's id on the region and on each payment: `pp_{identifier}_{config.id}`,
// with both halves "cash" where it's registered (medusa-config.ts). Must match
// CASH_PAYMENT_PROVIDER_ID in the kiosk's src/lib/payment.ts.
export const CASH_PAYMENT_PROVIDER_ID = "pp_cash_cash"
