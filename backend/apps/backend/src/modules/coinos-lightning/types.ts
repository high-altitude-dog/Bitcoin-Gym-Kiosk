// The provider's id as it ends up on a region's payment_providers list and in
// the Coinos webhook URL: `pp_{identifier}_{config.id}`. Both halves are set
// to this same string where the provider is registered, so the combined id
// stays a fixed, known value instead of something assembled at runtime.
export const COINOS_LIGHTNING_PROVIDER_ID = "pp_coinos-lightning_coinos-lightning"

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
  yadioCacheTtlMs?: number
}
