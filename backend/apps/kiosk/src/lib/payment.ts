// Must match COINOS_LIGHTNING_PROVIDER_ID in
// backend/apps/backend/src/modules/coinos-lightning/types.ts.
export const COINOS_LIGHTNING_PROVIDER_ID = "pp_coinos-lightning_coinos-lightning"
// Medusa's built-in provider: records a payment without charging anything.
// Used by the bank QR "Pagado" button until the Baneco API exists.
export const MANUAL_PAYMENT_PROVIDER_ID = "pp_system_default"

// Shape of the payment session `data` coinos-lightning's initiatePayment
// returns (see that module's service.ts). The kiosk only reads these fields;
// it never writes payment data itself.
export type LightningInvoice = {
  bolt11: string
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
  receivedAt: number
): LightningInvoice | null {
  if (!data || typeof data.bolt11 !== "string") return null
  const expirySeconds = Number(data.expiry_seconds ?? 0)
  return {
    bolt11: data.bolt11,
    satsAmount: Number(data.sats_amount ?? 0),
    bobAmount: Number(data.bob_amount ?? 0),
    expiresAt: expirySeconds > 0 ? receivedAt + expirySeconds * 1000 : Number(data.expires_at ?? 0),
  }
}
