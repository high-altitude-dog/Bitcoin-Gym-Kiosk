// The provider's id on a region's payment_providers list and in the webhook
// event: `pp_{identifier}_{config.id}`, both halves set to "bark-ark".
export const BARK_ARK_PROVIDER_ID = "pp_bark-ark_bark-ark"

export type BarkArkOptions = {
  // Our self-hosted Bark Pay, e.g. https://bark.paywithbitcoin.lol
  barkPayUrl: string
  // A secret API key (sk_live_... on mainnet), created in Bark Pay.
  barkPayApiKey: string
  // The webhook endpoint's signing secret (whsec_...), from Bark Pay.
  webhookSecret: string
  yadioApiUrl: string
  chargeExpirySeconds?: number
  yadioCacheTtlMs?: number
}
