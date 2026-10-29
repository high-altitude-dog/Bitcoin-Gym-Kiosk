// The provider's id on a region's payment_providers list:
// `pp_{identifier}_{config.id}`, both halves set to "bip321".
export const BIP321_PROVIDER_ID = "pp_bip321_bip321"

export type Bip321Options = {
  // Coinos, for the BOLT12 offer (the same account as coinos-lightning).
  coinosApiUrl: string
  coinosApiToken: string
  // COINOS_WEBHOOK_SECRET: the offer's webhook goes to /hooks/coinos, where
  // coinos-lightning checks it (see service.ts).
  coinosWebhookSecret: string
  webhookBaseUrl: string
  // Our self-hosted Bark Pay, for the Ark address (the same as bark-ark).
  barkPayUrl: string
  barkPayApiKey: string
  yadioApiUrl: string
  expirySeconds?: number
  yadioCacheTtlMs?: number
}
