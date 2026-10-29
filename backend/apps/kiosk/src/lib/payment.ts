// Must match COINOS_LIGHTNING_PROVIDER_ID in
// backend/apps/backend/src/modules/coinos-lightning/types.ts.
export const COINOS_LIGHTNING_PROVIDER_ID = "pp_coinos-lightning_coinos-lightning"
// "Bitcoin Ark" through our self-hosted Bark Pay. Must match BARK_ARK_PROVIDER_ID
// in backend/apps/backend/src/modules/bark-ark/types.ts.
export const BARK_ARK_PROVIDER_ID = "pp_bark-ark_bark-ark"
// Medusa's built-in provider: records a payment without charging anything.
// Used by the bank QR "Pagado" button until the Baneco API exists.
export const MANUAL_PAYMENT_PROVIDER_ID = "pp_system_default"
// Cash at the front desk: authorized at the kiosk, captured by staff in the
// admin. Must match CASH_PAYMENT_PROVIDER_ID in
// backend/apps/backend/src/modules/cash-payment/types.ts.
export const CASH_PAYMENT_PROVIDER_ID = "pp_cash_cash"

export type InvoiceMethod = "lightning" | "ark"

export const INVOICE_PROVIDER_ID: Record<InvoiceMethod, string> = {
  lightning: COINOS_LIGHTNING_PROVIDER_ID,
  ark: BARK_ARK_PROVIDER_ID,
}

// Shape of the payment session `data` coinos-lightning's and bark-ark's
// initiatePayment return (see their service.ts). The kiosk only reads these
// fields; it never writes payment data itself.
export type LightningInvoice = {
  method: InvoiceMethod
  // What the QR encodes: `lightning:<bolt11>` for Coinos; for Bark Pay, one
  // BIP 321 URI carrying both the Ark address and a Lightning invoice.
  qr: string
  satsAmount: number
  bobAmount: number
  // A deadline on the tablet's own clock, not the server's.
  expiresAt: number
}

// `receivedAt` is when the kiosk got the invoice back (Date.now()). The
// deadline is that plus the invoice's lifetime, so a tablet clock that has
// drifted from the server's can't make a live invoice look expired.
export function readLightningInvoice(
  data: Record<string, unknown> | null | undefined,
  receivedAt: number,
  method: InvoiceMethod = "lightning"
): LightningInvoice | null {
  if (!data) return null
  const qr =
    method === "ark"
      ? typeof data.payment_uri === "string" ? data.payment_uri : null
      : typeof data.bolt11 === "string" ? `lightning:${data.bolt11}` : null
  if (!qr) return null
  const expirySeconds = Number(data.expiry_seconds ?? 0)
  return {
    method,
    qr,
    satsAmount: Number(data.sats_amount ?? 0),
    bobAmount: Number(data.bob_amount ?? 0),
    expiresAt: expirySeconds > 0 ? receivedAt + expirySeconds * 1000 : Number(data.expires_at ?? 0),
  }
}
