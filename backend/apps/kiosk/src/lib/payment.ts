// Must match COINOS_LIGHTNING_PROVIDER_ID in
// backend/apps/backend/src/modules/coinos-lightning/types.ts.
export const COINOS_LIGHTNING_PROVIDER_ID = "pp_coinos-lightning_coinos-lightning"

// Shape of the payment session `data` coinos-lightning's initiatePayment
// returns (see that module's service.ts). The kiosk only reads these fields;
// it never writes payment data itself.
export type LightningInvoice = {
  bolt11: string
  satsAmount: number
  bobAmount: number
  expiresAt: number
}

export function readLightningInvoice(data: Record<string, unknown> | null | undefined): LightningInvoice | null {
  if (!data || typeof data.bolt11 !== "string") return null
  return {
    bolt11: data.bolt11,
    satsAmount: Number(data.sats_amount ?? 0),
    bobAmount: Number(data.bob_amount ?? 0),
    expiresAt: Number(data.expires_at ?? 0),
  }
}
