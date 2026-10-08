// The provider's id as it ends up on a region's payment_providers list and in
// the Coinos webhook URL: `pp_{identifier}_{config.id}`. Both halves are set
// to this same string where the provider is registered, so the combined id
// stays a fixed, known value instead of something assembled at runtime.
export const COINOS_LIGHTNING_PROVIDER_ID = "pp_coinos-lightning_coinos-lightning"

export const COINOS_INVOICE_TYPES = ["lightning", "bolt12"] as const
export type CoinosInvoiceType = (typeof COINOS_INVOICE_TYPES)[number]

export type CoinosLightningOptions = {
  coinosApiUrl: string
  coinosApiToken: string
  yadioApiUrl: string
  // Shared secret sent on every invoice we create and echoed back by Coinos
  // on the webhook call; we check it matches before trusting a callback.
  webhookSecret: string
  // Publicly reachable base URL of this Medusa backend, used to build the
  // Coinos webhook callback (Coinos must be able to reach it over the internet).
  webhookBaseUrl: string
  invoiceExpirySeconds?: number
  // What Coinos creates: "lightning" (a BOLT11 invoice, the default) or
  // "bolt12" (an offer). BOLT12 is for testing only so far: offers are
  // reusable, and not every wallet can pay one.
  invoiceType?: CoinosInvoiceType
  yadioCacheTtlMs?: number
}
